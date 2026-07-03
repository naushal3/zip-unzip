import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  scanSelectedDirectory, 
  processQueue, 
  getAppStateAndStats 
} from './services/zipService.js';
import { state, logMessage } from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_ENV = path.join(__dirname, 'test-env');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('--- STARTING BACKEND ENGINE VERIFICATION ---');
  
  // 1. Prepare test directories and files
  if (fs.existsSync(TEST_ENV)) {
    fs.rmSync(TEST_ENV, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_ENV);
  
  const folder1 = path.join(TEST_ENV, 'Folder1');
  const folder2 = path.join(TEST_ENV, 'Folder2');
  fs.mkdirSync(folder1);
  fs.mkdirSync(folder2);
  
  fs.writeFileSync(path.join(folder1, 'text1.txt'), 'Hello world 1');
  fs.writeFileSync(path.join(folder1, 'excl.log'), 'This should be excluded'); // file matching exclusion list
  fs.writeFileSync(path.join(folder2, 'text2.txt'), 'Hello world 2');

  console.log('Mock environment prepared at:', TEST_ENV);

  // 2. Scan Directory
  console.log('Testing scanSelectedDirectory...');
  const items = scanSelectedDirectory(TEST_ENV);
  if (items.length !== 2) {
    throw new Error(`Expected 2 items, found ${items.length}`);
  }
  console.log('Scan passed. Found:', items.map(i => i.name));

  // 3. Setup settings exclusions
  state.settings.excludedExtensions = ['.log'];
  state.settings.overwritePolicy = 'timestamp';

  // 4. Test Queue Zipping
  console.log('Testing batch zipping via processQueue...');
  processQueue.add(folder1, 'zip');
  processQueue.add(folder2, 'zip');
  
  processQueue.start();

  // Wait for processing to complete
  while (processQueue.isProcessing) {
    await sleep(200);
  }

  // Check zip files are generated
  const zip1 = path.join(TEST_ENV, 'Folder1.zip');
  const zip2 = path.join(TEST_ENV, 'Folder2.zip');
  if (!fs.existsSync(zip1) || !fs.existsSync(zip2)) {
    throw new Error('Zip files were not successfully created!');
  }
  console.log('Zipping passed. Zip archives created.');

  // Validate exclusion worked
  const AdmZip = (await import('adm-zip')).default;
  const zipObj = new AdmZip(zip1);
  const entries = zipObj.getEntries().map(e => e.entryName);
  if (entries.includes('excl.log')) {
    throw new Error('Exclusion check failed! excl.log is present in Folder1.zip');
  }
  console.log('Exclusion check passed (excl.log is correctly excluded).');

  // 5. Test Extraction
  console.log('Testing batch extraction...');
  // Delete original folders first
  fs.rmSync(folder1, { recursive: true, force: true });
  fs.rmSync(folder2, { recursive: true, force: true });

  // Rescan to update state
  scanSelectedDirectory(TEST_ENV);

  processQueue.add(zip1, 'extract');
  processQueue.add(zip2, 'extract');
  
  processQueue.start();

  while (processQueue.isProcessing) {
    await sleep(200);
  }

  if (!fs.existsSync(folder1) || !fs.existsSync(folder2)) {
    throw new Error('Extraction failed to restore original folders!');
  }

  const restoredContent = fs.readFileSync(path.join(folder1, 'text1.txt'), 'utf8');
  if (restoredContent !== 'Hello world 1') {
    throw new Error(`Content mismatch. Expected "Hello world 1", got "${restoredContent}"`);
  }
  console.log('Extraction passed. Folders successfully restored.');

  // 6. Test Naming Collision Strategy (Timestamp rename)
  console.log('Testing naming collision (timestamp append) strategy...');
  // Scan to detect ZIPs and Folders
  scanSelectedDirectory(TEST_ENV);
  // Zip folder1 again, should rename output file because Folder1.zip already exists
  processQueue.add(folder1, 'zip');
  processQueue.start();

  while (processQueue.isProcessing) {
    await sleep(200);
  }

  // Look for any zip file containing Folder1_2026
  const files = fs.readdirSync(TEST_ENV);
  const timestampZipExists = files.some(f => f.startsWith('Folder1_2026') && f.endsWith('.zip'));
  if (!timestampZipExists) {
    throw new Error('Collision check failed! No timestamped zip file created.');
  }
  console.log('Collision checking passed. Timestamped file created:', files.filter(f => f.startsWith('Folder1_2026')));

  // Clean up
  fs.rmSync(TEST_ENV, { recursive: true, force: true });
  console.log('--- ALL BACKEND CORE TESTS COMPLETED SUCCESSFULLY ---');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
