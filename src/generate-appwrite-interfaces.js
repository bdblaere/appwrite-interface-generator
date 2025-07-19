#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

function printHelp() {
  console.log(`
This package allows you to generate TypeScript interfaces from Appwrite collections defined in appwrite.json
Usage: generate-appwrite-interfaces --input=FILE --output=DIR

Options:
  --input=FILE       Path to the input appwrite JSON file (required)
  --output=DIR       Path to output directory for generated interfaces (required)
  --help             Show this help message

Examples:
  generate-appwrite-interfaces --input=path/to/appwrite.json --output=src/appwrite-interfaces
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=', 2);
      options[key] = value;
    }
  }
  return options;
}

const options = parseArgs();

if (options.help) {
  printHelp();
  process.exit(0);
}

// Check required arguments
if (!options.input || !options.output) {
  console.error('❌ Error: Both --input and --output parameters are required.');
  printHelp();
  process.exit(1);
}

const INPUT_FILE = path.resolve(process.cwd(), options.input);
const OUTPUT_DIR = path.resolve(process.cwd(), options.output);

console.log('Using input file:', INPUT_FILE);
console.log('Using output dir:', OUTPUT_DIR);

const typeMap = {
  string: 'string',
  integer: 'number',
  float: 'number',
  boolean: 'boolean',
  email: 'string',
  url: 'string',
  ip: 'string',
  enum: 'string',
  datetime: 'string',
};

const defaultAttributes = {
  "$sequence": "number",
}

function getArraySuffix(attr) {
  if (attr.relationType?.endsWith('ToMany')) {
    return '[]'; // a *ToMany relationship is represented as an array
  }
  return attr.array ? '[]' : '';
}

function toPascalCase(str) {
  return str
    .replace(/[_-](\w)/g, (_, c) => c.toUpperCase())
    .replace(/^\w/, (c) => c.toUpperCase());
}

function getTypeFromAttribute(attr) {
  if (attr.type === 'relationship') {
    if (!attr.relatedCollection) {
      return 'any';
    }
    return toPascalCase(attr.relatedCollection);
  }

  const tsType = typeMap[attr.type] || 'any';
  return tsType;
}

function generateInterfaceCode(collection) {
  const relatedCollections = new Set(); // Track related collections for relationships

  const interfaceName = toPascalCase(collection.name);

  // start with the default attributes
  const attributes = Object.entries(defaultAttributes).map(([key, type]) => {
    return `  ${key}: ${type};`;
  });

  // then, add the attributes from the collection
  for (const attr of collection.attributes) {
    const optional = attr.required ? '' : '?';
    const tsType = getTypeFromAttribute(attr);
    const arraySuffix = getArraySuffix(attr);
    attributes.push(`  ${attr.key}${optional}: ${tsType}${arraySuffix};`);

    if (attr.type === 'relationship') {
      relatedCollections.add(tsType);
    }
  }

  // import the related collections
  const imports = [...relatedCollections]
    .filter(rel => rel != interfaceName)
    .map(rel => `import { ${rel} } from './${rel}';`);

  return [
    '// This file is auto-generated from Appwrite schema by the appwrite-interface-generator package',
    '// Any changes you make here will be overwritten',
    `// To regenerate, run: generate-appwrite-interfaces --input=${options.input} --output=${options.output}`,
    `import { Models } from 'appwrite';`,
    ...imports,
    '',
    `export interface ${interfaceName} extends Models.Document {`,
    ...attributes,
    '}',
    ''
  ].join('\n');
}

async function writeInterfaceToFile(databaseId, collectionName, code) {
  const dirPath = path.join(OUTPUT_DIR, databaseId);
  await fs.mkdir(dirPath, { recursive: true });

  const filePath = path.join(dirPath, `${toPascalCase(collectionName)}.ts`);
  await fs.writeFile(filePath, code, 'utf-8');
  console.log(`✅ Generated: ${filePath}`);
}

async function main() {
  const jsonRaw = await fs.readFile(INPUT_FILE, 'utf-8');
  const data = JSON.parse(jsonRaw);

  const collections = data.collections || [];
  for (const collection of collections) {
    const code = generateInterfaceCode(collection);
    await writeInterfaceToFile(collection.databaseId, collection.name, code);
  }
}

main().catch((err) => {
  console.error('❌ Error generating interfaces:', err);
  process.exit(1);
});
