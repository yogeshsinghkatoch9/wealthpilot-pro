/**
 * Database Backup Service
 * Automated PostgreSQL backup to AWS S3 with retention policies
 * Supports both manual and scheduled backups
 */

const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const logger = require('../../utils/logger');

const execAsync = promisify(exec);

class BackupService {
  constructor() {
    this.s3Client = null;
    this.bucketName = process.env.AWS_BACKUP_BUCKET || 'wealthpilot-backups';
    this.region = process.env.AWS_REGION || 'us-east-2';
    this.retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS) || 30;
    this.localBackupDir = path.join(process.cwd(), 'backups');
    this.isConfigured = false;
    this.scheduledJob = null;

    this.initialize();
  }

  async initialize() {
    // Create local backup directory
    try {
      await fs.mkdir(this.localBackupDir, { recursive: true });
    } catch (error) {
      logger.warn('[BackupService] Could not create local backup dir:', error.message);
    }

    // Initialize S3 client if AWS is configured
    if (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_REGION) {
      try {
        this.s3Client = new S3Client({
          region: this.region,
        });
        this.isConfigured = true;
        logger.info('[BackupService] S3 client initialized');
      } catch (error) {
        logger.warn('[BackupService] S3 not configured, local backups only');
      }
    }
  }

  /**
   * Create a database backup
   * @param {string} type - 'full' or 'schema' or 'data'
   * @returns {Promise<object>} Backup result
   */
  async createBackup(type = 'full') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `wealthpilot-${type}-${timestamp}.sql.gz`;
    const localPath = path.join(this.localBackupDir, filename);

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL not configured');
    }

    try {
      // Parse database URL
      const dbConfig = this.parseDatabaseUrl(databaseUrl);

      // Build pg_dump command
      let pgDumpArgs = '';
      switch (type) {
        case 'schema':
          pgDumpArgs = '--schema-only';
          break;
        case 'data':
          pgDumpArgs = '--data-only';
          break;
        default:
          pgDumpArgs = ''; // Full backup
      }

      const command = `PGPASSWORD="${dbConfig.password}" pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} ${pgDumpArgs} | gzip > "${localPath}"`;

      logger.info(`[BackupService] Creating ${type} backup...`);
      const startTime = Date.now();

      await execAsync(command, {
        env: { ...process.env, PGPASSWORD: dbConfig.password }
      });

      const duration = Date.now() - startTime;
      const stats = await fs.stat(localPath);

      logger.info(`[BackupService] Local backup created: ${filename} (${this.formatBytes(stats.size)}) in ${duration}ms`);

      // Upload to S3 if configured
      let s3Result = null;
      if (this.isConfigured) {
        s3Result = await this.uploadToS3(localPath, filename);
      }

      // Record backup metadata
      const backupRecord = {
        id: timestamp,
        filename,
        type,
        size: stats.size,
        localPath,
        s3Key: s3Result?.key || null,
        s3Bucket: s3Result ? this.bucketName : null,
        createdAt: new Date().toISOString(),
        duration,
        status: 'completed'
      };

      // Save backup record
      await this.saveBackupRecord(backupRecord);

      return backupRecord;

    } catch (error) {
      logger.error('[BackupService] Backup failed:', error.message);
      throw error;
    }
  }

  /**
   * Upload backup file to S3
   */
  async uploadToS3(localPath, filename) {
    if (!this.s3Client) {
      return null;
    }

    const key = `backups/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${filename}`;

    try {
      const fileContent = await fs.readFile(localPath);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileContent,
        ContentType: 'application/gzip',
        ServerSideEncryption: 'AES256',
        Metadata: {
          'backup-type': 'postgresql',
          'created-by': 'wealthpilot-backup-service'
        }
      });

      await this.s3Client.send(command);
      logger.info(`[BackupService] Uploaded to S3: ${key}`);

      return { bucket: this.bucketName, key };

    } catch (error) {
      logger.error('[BackupService] S3 upload failed:', error.message);
      throw error;
    }
  }

  /**
   * List all backups
   * @param {number} limit - Maximum number of backups to return
   */
  async listBackups(limit = 50) {
    const backups = [];

    // List local backups
    try {
      const files = await fs.readdir(this.localBackupDir);
      for (const file of files) {
        if (file.endsWith('.sql.gz')) {
          const filePath = path.join(this.localBackupDir, file);
          const stats = await fs.stat(filePath);
          backups.push({
            filename: file,
            location: 'local',
            size: stats.size,
            createdAt: stats.birthtime
          });
        }
      }
    } catch (error) {
      logger.warn('[BackupService] Error listing local backups:', error.message);
    }

    // List S3 backups if configured
    if (this.isConfigured) {
      try {
        const command = new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: 'backups/',
          MaxKeys: limit
        });

        const response = await this.s3Client.send(command);

        if (response.Contents) {
          for (const obj of response.Contents) {
            // Avoid duplicates
            const filename = path.basename(obj.Key);
            if (!backups.find(b => b.filename === filename)) {
              backups.push({
                filename,
                location: 's3',
                s3Key: obj.Key,
                size: obj.Size,
                createdAt: obj.LastModified
              });
            }
          }
        }
      } catch (error) {
        logger.warn('[BackupService] Error listing S3 backups:', error.message);
      }
    }

    // Sort by date (newest first)
    backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return backups.slice(0, limit);
  }

  /**
   * Restore from a backup
   * @param {string} filename - Backup filename
   * @param {string} location - 'local' or 's3'
   */
  async restoreBackup(filename, location = 'local') {
    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL not configured');
    }

    const dbConfig = this.parseDatabaseUrl(databaseUrl);
    let localPath = path.join(this.localBackupDir, filename);

    // Download from S3 if needed
    if (location === 's3' && this.isConfigured) {
      const key = `backups/${filename}`;
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const response = await this.s3Client.send(command);
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      await fs.writeFile(localPath, Buffer.concat(chunks));
    }

    // Verify file exists
    try {
      await fs.access(localPath);
    } catch {
      throw new Error(`Backup file not found: ${filename}`);
    }

    // Restore the backup
    const restoreCommand = `gunzip -c "${localPath}" | PGPASSWORD="${dbConfig.password}" psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database}`;

    logger.info(`[BackupService] Restoring backup: ${filename}`);

    try {
      await execAsync(restoreCommand);
      logger.info('[BackupService] Restore completed successfully');
      return { success: true, filename };
    } catch (error) {
      logger.error('[BackupService] Restore failed:', error.message);
      throw error;
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupOldBackups() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    let deleted = { local: 0, s3: 0 };

    // Clean up local backups
    try {
      const files = await fs.readdir(this.localBackupDir);
      for (const file of files) {
        if (file.endsWith('.sql.gz')) {
          const filePath = path.join(this.localBackupDir, file);
          const stats = await fs.stat(filePath);
          if (stats.birthtime < cutoffDate) {
            await fs.unlink(filePath);
            deleted.local++;
            logger.info(`[BackupService] Deleted old local backup: ${file}`);
          }
        }
      }
    } catch (error) {
      logger.warn('[BackupService] Error cleaning local backups:', error.message);
    }

    // Clean up S3 backups
    if (this.isConfigured) {
      try {
        const command = new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: 'backups/'
        });

        const response = await this.s3Client.send(command);

        if (response.Contents) {
          for (const obj of response.Contents) {
            if (obj.LastModified < cutoffDate) {
              await this.s3Client.send(new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: obj.Key
              }));
              deleted.s3++;
              logger.info(`[BackupService] Deleted old S3 backup: ${obj.Key}`);
            }
          }
        }
      } catch (error) {
        logger.warn('[BackupService] Error cleaning S3 backups:', error.message);
      }
    }

    return deleted;
  }

  /**
   * Schedule automated backups
   * @param {string} schedule - Cron expression (default: daily at 2 AM)
   */
  scheduleBackups(schedule = '0 2 * * *') {
    if (this.scheduledJob) {
      this.scheduledJob.stop();
    }

    this.scheduledJob = cron.schedule(schedule, async () => {
      logger.info('[BackupService] Running scheduled backup...');
      try {
        await this.createBackup('full');
        await this.cleanupOldBackups();
      } catch (error) {
        logger.error('[BackupService] Scheduled backup failed:', error.message);
      }
    });

    logger.info(`[BackupService] Backups scheduled: ${schedule}`);
  }

  /**
   * Stop scheduled backups
   */
  stopScheduledBackups() {
    if (this.scheduledJob) {
      this.scheduledJob.stop();
      this.scheduledJob = null;
      logger.info('[BackupService] Scheduled backups stopped');
    }
  }

  /**
   * Get backup service status
   */
  getStatus() {
    return {
      isConfigured: this.isConfigured,
      s3Bucket: this.isConfigured ? this.bucketName : null,
      region: this.region,
      retentionDays: this.retentionDays,
      localBackupDir: this.localBackupDir,
      scheduledBackupsActive: !!this.scheduledJob
    };
  }

  // Helper methods

  parseDatabaseUrl(url) {
    // postgresql://user:password@host:port/database
    const regex = /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/;
    const match = url.match(regex);

    if (!match) {
      throw new Error('Invalid DATABASE_URL format');
    }

    return {
      user: match[1],
      password: match[2],
      host: match[3],
      port: match[4],
      database: match[5]
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async saveBackupRecord(record) {
    const recordsPath = path.join(this.localBackupDir, 'backup-history.json');
    let records = [];

    try {
      const data = await fs.readFile(recordsPath, 'utf-8');
      records = JSON.parse(data);
    } catch {
      // File doesn't exist yet
    }

    records.unshift(record);
    records = records.slice(0, 100); // Keep last 100 records

    await fs.writeFile(recordsPath, JSON.stringify(records, null, 2));
  }

  async getBackupHistory() {
    const recordsPath = path.join(this.localBackupDir, 'backup-history.json');

    try {
      const data = await fs.readFile(recordsPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
}

// Singleton instance
const backupService = new BackupService();

module.exports = backupService;
