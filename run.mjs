#!/usr/bin/env node

/**
 * Interactive runner for Optical Design Ray Tracer
 * Allows switching between test mode and dev server
 */

import { spawn } from 'child_process';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function showMenu() {
  console.clear();
  console.log('🔬 Optical Design Ray Tracer');
  console.log('============================');
  console.log('');
  console.log('Choose an option:');
  console.log('');
  console.log('  1. 🧪 Run Ground Truth Tests (Console)');
  console.log('  2. 🌐 Start Development Server (Browser)');
  console.log('  3. 🏗️  Build Production');
  console.log('  4. 🔍 Lint Code');
  console.log('  5. ❌ Exit');
  console.log('');
}

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Running: ${command} ${args.join(' ')}\n`);
    
    const process = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd()
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    process.on('error', (error) => {
      reject(error);
    });
  });
}

async function handleChoice(choice) {
  switch (choice.trim()) {
    case '1':
      console.log('\n🧪 Running Ground Truth Validation Tests...');
      try {
        await runCommand('npm', ['run', 'test']);
        console.log('\n✅ Tests completed!');
      } catch (error) {
        console.log('\n❌ Tests failed or interrupted.');
      }
      break;

    case '2':
      console.log('\n🌐 Starting Development Server...');
      console.log('📝 Press Ctrl+C to stop the server and return to menu');
      try {
        await runCommand('npm', ['run', 'dev']);
      } catch (error) {
        console.log('\n🔄 Development server stopped.');
      }
      break;

    case '3':
      console.log('\n🏗️ Building Production...');
      try {
        await runCommand('npm', ['run', 'build']);
        console.log('\n✅ Build completed!');
      } catch (error) {
        console.log('\n❌ Build failed.');
      }
      break;

    case '4':
      console.log('\n🔍 Linting Code...');
      try {
        await runCommand('npm', ['run', 'lint']);
        console.log('\n✅ Linting completed!');
      } catch (error) {
        console.log('\n❌ Linting found issues.');
      }
      break;

    case '5':
      console.log('\n👋 Goodbye!');
      rl.close();
      process.exit(0);
      break;

    default:
      console.log('\n❌ Invalid choice. Please enter 1, 2, 3, 4, or 5.');
      break;
  }

  // Return to menu after command completion
  console.log('\n⏎  Press Enter to return to menu...');
  await new Promise(resolve => {
    rl.once('line', resolve);
  });
  
  promptUser();
}

function promptUser() {
  showMenu();
  rl.question('Enter your choice (1-5): ', handleChoice);
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Goodbye!');
  rl.close();
  process.exit(0);
});

// Start the interactive menu
console.log('🔬 Welcome to Optical Design Ray Tracer Interactive Runner!\n');
promptUser();
