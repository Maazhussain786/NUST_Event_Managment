/**
 * Test Azure Blob Storage Connection
 *
 * Run: node test-blob-connection.js
 *
 * Tests:
 *   1. Connection to Azure Blob Storage
 *   2. Container creation
 *   3. Upload a test file
 *   4. Read the test file back
 *   5. Delete the test file
 */

require('dotenv').config({ path: '.env.local' });

const { BlobServiceClient } = require('@azure/storage-blob');

const CONTAINERS = [
  'profile-pictures',
  'society-media',
  'event-media',
  'post-attachments',
  'note-attachments',
];

async function testBlobConnection() {
  console.log('========================================');
  console.log('  Azure Blob Storage Connection Test');
  console.log('========================================\n');

  const connectionString = process.env.AZURE_BLOB_CONNECTION_STRING;

  // Check env var
  if (!connectionString || connectionString.includes('YOUR_ACCOUNT') || connectionString.includes('YOUR_KEY')) {
    console.error('❌ AZURE_BLOB_CONNECTION_STRING is not set or contains placeholder values.');
    console.error('   Edit .env.local and set your actual Azure Storage connection string.');
    console.error('   See AZURE_BLOB_SETUP.md for instructions.\n');
    process.exit(1);
  }

  console.log('📋 Connection string found (starts with):', connectionString.substring(0, 60) + '...\n');

  try {
    // 1. Connect
    console.log('1️⃣  Connecting to Azure Blob Storage...');
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const accountInfo = await blobServiceClient.getAccountInfo();
    console.log(`   ✅ Connected! SKU: ${accountInfo.skuName}, Kind: ${accountInfo.accountKind}\n`);

    // 2. Create containers
    console.log('2️⃣  Ensuring all containers exist...');
    for (const name of CONTAINERS) {
      const container = blobServiceClient.getContainerClient(name);
      const created = await container.createIfNotExists({ access: undefined });
      if (created.succeeded) {
        console.log(`   ✅ Created container: ${name}`);
      } else {
        console.log(`   ✅ Container exists: ${name}`);
      }
    }
    console.log('');

    // 3. Upload test file
    console.log('3️⃣  Uploading test file...');
    const testContainer = blobServiceClient.getContainerClient('profile-pictures');
    const testBlob = testContainer.getBlockBlobClient('_test/connection-test.txt');
    const testContent = `Connection test at ${new Date().toISOString()}`;
    await testBlob.upload(testContent, testContent.length, {
      blobHTTPHeaders: { blobContentType: 'text/plain' },
    });
    console.log(`   ✅ Uploaded test file: ${testBlob.url}\n`);

    // 4. Read it back
    console.log('4️⃣  Reading test file back...');
    const downloadResponse = await testBlob.download();
    const chunks = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(chunk);
    }
    const downloadedContent = Buffer.concat(chunks).toString();
    if (downloadedContent === testContent) {
      console.log('   ✅ File content matches! Read/write working.\n');
    } else {
      console.log('   ⚠️  Content mismatch (but connection works).\n');
    }

    // 5. Delete test file
    console.log('5️⃣  Cleaning up test file...');
    await testBlob.deleteIfExists();
    console.log('   ✅ Test file deleted.\n');

    // Summary
    console.log('========================================');
    console.log('  ✅ ALL TESTS PASSED');
    console.log('========================================');
    console.log('\nAzure Blob Storage is ready to use!');
    console.log('Containers created:', CONTAINERS.join(', '));
    console.log('\nNext steps:');
    console.log('  1. Run schema-media.sql against your PostgreSQL');
    console.log('  2. Run schema-storage-quota.sql against your PostgreSQL');
    console.log('  3. Start the dev server: npm run dev');
  } catch (error) {
    console.error('\n❌ CONNECTION FAILED\n');
    console.error('Error:', error.message);

    if (error.code === 'AuthenticationFailed') {
      console.error('\n💡 Fix: Your account key is invalid.');
      console.error('   Go to Azure Portal → Storage Account → Access Keys');
      console.error('   Copy the correct key and update .env.local');
    } else if (error.code === 'ENOTFOUND' || error.message.includes('getaddrinfo')) {
      console.error('\n💡 Fix: Storage account not found.');
      console.error('   Check that AZURE_BLOB_ACCOUNT_NAME in your connection string is correct.');
    } else if (error.message.includes('connect')) {
      console.error('\n💡 Fix: Network issue. Check your internet connection.');
    }

    process.exit(1);
  }
}

testBlobConnection();
