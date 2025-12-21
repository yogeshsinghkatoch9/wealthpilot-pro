const { prisma } = require('./src/db/simpleDb');

const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZWUyYzNmNC0zZTVkLTQyODMtODI1My0xYmNlMTI5MDNmYWYiLCJlbWFpbCI6ImRlbW9Ad2VhbHRocGlsb3QuY29tIiwiaWF0IjoxNzY1Njc5MzIxLCJleHAiOjE3NjYyODQxMjF9.laC5yy4YtlItxUVV0JZGP7nfH07I1iznqan1KnYHuGQ';

async function test() {
  try {
    console.log('Testing Prisma session lookup...');
    console.log('Token:', testToken);

    const session = await prisma.session.findUnique({
      where: { token: testToken },
      include: { user: true }
    });

    console.log('\nSession found:', session ? 'YES' : 'NO');
    if (session) {
      console.log('User ID:', session.userId);
      console.log('User email:', session.user?.email);
      console.log('Expires at:', session.expiresAt);
      console.log('Is expired?', session.expiresAt < new Date());
      console.log('Is active?', session.user?.isActive);
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

test();
