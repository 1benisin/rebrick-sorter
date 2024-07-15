const fs = require('fs');
const path = require('path');
const os = require('os');

const desktopPath = path.join(os.homedir(), 'Desktop');
const targetFolderName = 'ProjectFiles_' + new Date().toISOString().replace(/:/g, '-');
const targetPath = path.join(desktopPath, targetFolderName);

function copyFiles(sourceDir, targetDir, basePath) {
  const files = fs.readdirSync(sourceDir);

  files.forEach((file) => {
    const sourcePath = path.join(sourceDir, file);
    const stats = fs.statSync(sourcePath);

    if (stats.isDirectory()) {
      // Skip node_modules and .next directories
      if (file !== 'node_modules' && file !== '.next') {
        copyFiles(sourcePath, targetDir, basePath);
      }
    } else if (path.extname(file) === '.ts' || path.extname(file) === '.tsx') {
      const relativePath = path.relative(basePath, sourcePath);
      const newFileName = relativePath.replace(/[\/\\]/g, '_');
      let targetFilePath = path.join(targetDir, newFileName);

      // Handle duplicate file names (though unlikely with full paths)
      let count = 1;
      while (fs.existsSync(targetFilePath)) {
        const parsedPath = path.parse(newFileName);
        targetFilePath = path.join(targetDir, `${parsedPath.name}_${count}${parsedPath.ext}`);
        count++;
      }

      fs.copyFileSync(sourcePath, targetFilePath);
      console.log(`Copied: ${relativePath} to ${path.relative(targetPath, targetFilePath)}`);
    }
  });
}

// Create the target directory
fs.mkdirSync(targetPath, { recursive: true });

// Start copying from the project root directory
const projectRoot = process.cwd();
copyFiles(projectRoot, targetPath, projectRoot);

console.log(`Finished copying files to: ${targetPath}`);
