const fs = require('fs');
const path = require('path');

function addFilePathComment(dir) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      // Skip node_modules and .next directories
      if (file !== 'node_modules' && file !== '.next') {
        addFilePathComment(filePath);
      }
    } else if (path.extname(file) === '.ts' || path.extname(file) === '.tsx') {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(process.cwd(), filePath);

      // Check if the comment already exists
      if (!content.startsWith(`// ${relativePath}`)) {
        const newContent = `// ${relativePath}\n\n${content}`;
        fs.writeFileSync(filePath, newContent);
        console.log(`Added comment to: ${relativePath}`);
      } else {
        console.log(`Comment already exists in: ${relativePath}`);
      }
    }
  });
}

// Start from the project root directory
addFilePathComment(process.cwd());

console.log('Finished adding comments to files.');
