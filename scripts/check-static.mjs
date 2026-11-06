import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const option = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
};
const root = path.resolve(option('--root') || fileURLToPath(new URL('../', import.meta.url)));
const inventoryFile = option('--inventory');
const configFile = option('--config');
const config = configFile ? JSON.parse(fs.readFileSync(path.resolve(root, configFile), 'utf8')) : {};
for (const name of ['entryPages', 'ignoreSourcePrefixes']) {
  if (config[name] && (!Array.isArray(config[name]) || config[name].some(value => typeof value !== 'string'))) {
    throw new Error('Configuração inválida: ' + name + ' deve ser um array de caminhos.');
  }
}
const normalize = value => value.split(String.fromCharCode(92)).join('/').replace(/^\.\//, '');
const entryPages = config.entryPages ? new Set(config.entryPages.map(normalize)) : null;
const ignoredPrefixes = (config.ignoreSourcePrefixes || []).map(normalize);
const ignoreSource = value => ignoredPrefixes.some(prefix => value === prefix.replace(/\/$/, '') || value.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'));
const ignored = new Set(['.git', 'node_modules']);
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  if (ignored.has(entry.name)) return [];
  const absolute = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(absolute) : entry.isFile() ? [absolute] : [];
});
const diskFiles = walk(root);
const relative = file => path.relative(root, file).split(path.sep).join('/');
const known = new Set(inventoryFile
  ? JSON.parse(fs.readFileSync(inventoryFile, 'utf8'))
  : diskFiles.map(relative));
const directories = new Set(['']);
for (const file of known) {
  let directory = path.posix.dirname(file);
  while (directory !== '.') {
    directories.add(directory);
    const parent = path.posix.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
}
const sources = diskFiles.filter(file => path.resolve(file) !== fileURLToPath(import.meta.url) && /\.(html?|css|[cm]?js)$/i.test(file) && !ignoreSource(relative(file)) && (!/\.html?$/i.test(file) || !entryPages || entryPages.has(relative(file))));
const errors = [];
if (entryPages) {
  for (const entry of entryPages) if (!sources.some(file => relative(file) === entry)) errors.push('Página de entrada não foi localizada entre as fontes: ' + entry);
}
const fail = (file, message) => errors.push(relative(file) + ': ' + message);
const htmlEntities = value => value.replace(/&(?:amp|quot|apos|lt|gt);|&#(?:x[0-9a-f]+|\d+);/gi, entity => {
  const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
  if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
  const number = entity.slice(2, -1);
  return String.fromCodePoint(number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number));
});
const attributes = text => Object.fromEntries(
  [...text.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+))/g)]
    .map(match => [match[1].toLowerCase(), htmlEntities(match[2] ?? match[3] ?? match[4])])
);
const documents = new Map();
for (const file of sources.filter(file => /\.html?$/i.test(file))) {
  const content = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi, '$1</script>')
    .replace(/(<style\b[^>]*>)[\s\S]*?<\/style\s*>/gi, '$1</style>');
  const tags = [...content.matchAll(/<([a-z][\w:-]*)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi)]
    .map(match => ({ tag: match[1].toLowerCase(), attrs: attributes(match[2]) }));
  const ids = tags.flatMap(({ attrs }) => attrs.id ? [attrs.id] : []);
  if (new Set(ids).size !== ids.length) fail(file, 'IDs repetidos no mesmo documento.');
  const targets = new Set([...ids, ...tags.filter(({ tag, attrs }) => tag === 'a' && attrs.name).map(({ attrs }) => attrs.name)]);
  documents.set(relative(file), { file, tags, targets });
}
let references = 0;
const checkReference = (value, source, css = false) => {
  if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return;
  let decoded = css ? value.replace(/\\([0-9a-f]{1,6})\s?|\\(.)/gi, (_, hex, literal) => hex ? String.fromCodePoint(parseInt(hex, 16)) : literal) : value;
  let fragment = '';
  const hash = decoded.indexOf('#');
  if (hash >= 0) { fragment = decoded.slice(hash + 1); decoded = decoded.slice(0, hash); }
  decoded = decoded.split('?')[0];
  try { decoded = decodeURIComponent(decoded); fragment = decodeURIComponent(fragment); }
  catch { fail(source, 'URL local contém codificação inválida.'); return; }
  const target = decoded ? path.posix.normalize(decoded.startsWith('/') ? decoded.slice(1) : path.posix.join(path.posix.dirname(relative(source)), decoded)) : relative(source);
  if (target === '..' || target.startsWith('../')) { fail(source, 'Referência local sai da raiz do projeto.'); return; }
  let destination = target;
  if (directories.has(target) && known.has(path.posix.join(target, 'index.html'))) destination = path.posix.join(target, 'index.html');
  if (decoded && !known.has(destination) && !directories.has(destination)) {
    fail(source, 'Recurso local ausente ou com grafia diferente: ' + target); return;
  }
  references++;
  // O fragmento vazio e #top são destinos nativos de retorno ao topo do documento.
  if (fragment && fragment.toLowerCase() !== 'top' && documents.has(destination) && !documents.get(destination).targets.has(fragment)) {
    fail(source, 'Fragmento sem destino no documento local: ' + fragment);
  }
};
for (const { file, tags } of documents.values()) {
  for (const { attrs } of tags) {
    for (const key of ['src', 'href', 'poster']) if (attrs[key]) checkReference(attrs[key], file);
  }
}
for (const file of sources.filter(file => /\.css$/i.test(file))) {
  const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
    checkReference((match[1] ?? match[2] ?? match[3]).trim(), file, true);
  }
  for (const match of css.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) checkReference(match[1] ?? match[2], file, true);
}
const scripts = sources.filter(file => /\.[cm]?js$/i.test(file));
for (const file of scripts) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) fail(file, 'node --check falhou. ' + (result.error?.message || result.stderr));
}
if (!documents.size) errors.push('Nenhum documento HTML foi localizado para conferir.');
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log('OK: ' + documents.size + ' HTML, ' + references + ' referências locais e sintaxe de ' + scripts.length + ' JavaScript.');
  if (inventoryFile) console.log('Recursos locais comparados com inventário GitHub; conteúdo binário e navegação não foram executados.');
}

