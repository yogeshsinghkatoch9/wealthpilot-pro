#!/bin/bash

##############################################
# WealthPilot Pro - Database Backup Script
# Automated backup with retention policy
##############################################

set -e  # Exit on error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
DB_PATH="${DB_PATH:-$PROJECT_ROOT/database/wealthpilot.db}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
LOG_FILE="${LOG_FILE:-$PROJECT_ROOT/logs/backup.log}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

##############################################
# Main Backup Function
##############################################

main() {
    log "Starting database backup..."

    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"

    # Check if database exists
    if [ ! -f "$DB_PATH" ]; then
        error "Database file not found: $DB_PATH"
        exit 1
    fi

    # Generate backup filename
    BACKUP_FILE="$BACKUP_DIR/backup_$DATE.db"

    # Perform SQLite backup
    log "Backing up database to: $BACKUP_FILE"

    if command -v sqlite3 &> /dev/null; then
        # Use SQLite backup command for safe backup (even if database is in use)
        sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'" 2>&1 | tee -a "$LOG_FILE"

        if [ ${PIPESTATUS[0]} -eq 0 ]; then
            success "Database backed up successfully"
        else
            error "SQLite backup failed"
            exit 1
        fi
    else
        # Fallback to simple copy if sqlite3 not available
        warning "sqlite3 command not found, using file copy instead"
        cp "$DB_PATH" "$BACKUP_FILE" 2>&1 | tee -a "$LOG_FILE"

        if [ $? -eq 0 ]; then
            success "Database copied successfully"
        else
            error "Database copy failed"
            exit 1
        fi
    fi

    # Compress backup
    log "Compressing backup..."
    gzip "$BACKUP_FILE" 2>&1 | tee -a "$LOG_FILE"

    if [ $? -eq 0 ]; then
        BACKUP_FILE="$BACKUP_FILE.gz"
        success "Backup compressed: $BACKUP_FILE"

        # Get file size
        SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log "Backup size: $SIZE"
    else
        error "Compression failed"
        exit 1
    fi

    # Upload to S3 if configured
    if [ -n "$AWS_S3_BACKUP_BUCKET" ]; then
        log "Uploading backup to S3..."

        if command -v aws &> /dev/null; then
            aws s3 cp "$BACKUP_FILE" "s3://$AWS_S3_BACKUP_BUCKET/database/$(basename "$BACKUP_FILE")" 2>&1 | tee -a "$LOG_FILE"

            if [ $? -eq 0 ]; then
                success "Backup uploaded to S3"
            else
                warning "S3 upload failed (local backup still available)"
            fi
        else
            warning "AWS CLI not found, skipping S3 upload"
        fi
    fi

    # Backup uploaded files
    if [ -d "$PROJECT_ROOT/uploads" ]; then
        log "Backing up uploaded files..."
        UPLOADS_BACKUP="$BACKUP_DIR/uploads_$DATE.tar.gz"

        tar -czf "$UPLOADS_BACKUP" -C "$PROJECT_ROOT" uploads 2>&1 | tee -a "$LOG_FILE"

        if [ $? -eq 0 ]; then
            success "Uploads backed up: $UPLOADS_BACKUP"
            SIZE=$(du -h "$UPLOADS_BACKUP" | cut -f1)
            log "Uploads backup size: $SIZE"

            # Upload to S3 if configured
            if [ -n "$AWS_S3_BACKUP_BUCKET" ] && command -v aws &> /dev/null; then
                aws s3 cp "$UPLOADS_BACKUP" "s3://$AWS_S3_BACKUP_BUCKET/uploads/$(basename "$UPLOADS_BACKUP")" 2>&1 | tee -a "$LOG_FILE"
            fi
        else
            warning "Uploads backup failed"
        fi
    fi

    # Backup generated PDFs
    if [ -d "$PROJECT_ROOT/generated-pdfs" ]; then
        log "Backing up generated PDFs..."
        PDFS_BACKUP="$BACKUP_DIR/pdfs_$DATE.tar.gz"

        tar -czf "$PDFS_BACKUP" -C "$PROJECT_ROOT" generated-pdfs 2>&1 | tee -a "$LOG_FILE"

        if [ $? -eq 0 ]; then
            success "PDFs backed up: $PDFS_BACKUP"
            SIZE=$(du -h "$PDFS_BACKUP" | cut -f1)
            log "PDFs backup size: $SIZE"

            # Upload to S3 if configured
            if [ -n "$AWS_S3_BACKUP_BUCKET" ] && command -v aws &> /dev/null; then
                aws s3 cp "$PDFS_BACKUP" "s3://$AWS_S3_BACKUP_BUCKET/pdfs/$(basename "$PDFS_BACKUP")" 2>&1 | tee -a "$LOG_FILE"
            fi
        else
            warning "PDFs backup failed"
        fi
    fi

    # Clean up old backups (retention policy)
    log "Cleaning up old backups (retention: $RETENTION_DAYS days)..."

    DELETED_COUNT=$(find "$BACKUP_DIR" -name "backup_*.db.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
    find "$BACKUP_DIR" -name "uploads_*.tar.gz" -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "pdfs_*.tar.gz" -mtime +$RETENTION_DAYS -delete

    if [ $DELETED_COUNT -gt 0 ]; then
        log "Deleted $DELETED_COUNT old backup(s)"
    else
        log "No old backups to delete"
    fi

    # Show backup summary
    log "Backup summary:"
    log "  Database backup: $(basename "$BACKUP_FILE")"
    log "  Total backups in directory: $(find "$BACKUP_DIR" -name "backup_*.db.gz" | wc -l)"
    log "  Backup directory size: $(du -sh "$BACKUP_DIR" | cut -f1)"

    success "Backup completed successfully!"
}

##############################################
# Execute main function
##############################################

main "$@"
