/**
 * modules that ship with the language, so are never installed from a registry.
 *
 * Checking `fs` or `os` against the package registry is wasted work and invites false alarms: the veto API's
 * typosquat check flags short unknown names that sit within two edits of a popular package.
 * Generated from Node's `module.builtinModules` and Python's `sys.stdlib_module_names`.
 */

const NODE_BUILTINS = new Set<string>([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto', 'dgram',
  'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
  'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline', 'repl', 'stream', 'string_decoder',
  'sys', 'timers', 'tls', 'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
  'node:sea', 'node:sqlite', 'node:test',
]);

const PYTHON_STDLIB = new Set<string>([
  'abc', 'annotationlib', 'antigravity', 'argparse', 'array', 'ast', 'asyncio', 'atexit', 'base64', 'bdb',
  'binascii', 'bisect', 'builtins', 'bz2', 'cProfile', 'calendar', 'cmath', 'cmd', 'code', 'codecs', 'codeop',
  'collections', 'colorsys', 'compileall', 'compression', 'concurrent', 'configparser', 'contextlib', 'contextvars',
  'copy', 'copyreg', 'csv', 'ctypes', 'curses', 'dataclasses', 'datetime', 'dbm', 'decimal', 'difflib', 'dis',
  'doctest', 'email', 'encodings', 'ensurepip', 'enum', 'errno', 'faulthandler', 'fcntl', 'filecmp', 'fileinput',
  'fnmatch', 'fractions', 'ftplib', 'functools', 'gc', 'genericpath', 'getopt', 'getpass', 'gettext', 'glob',
  'graphlib', 'grp', 'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http', 'idlelib', 'imaplib', 'importlib',
  'inspect', 'io', 'ipaddress', 'itertools', 'json', 'keyword', 'linecache', 'locale', 'logging', 'lzma', 'mailbox',
  'marshal', 'math', 'mimetypes', 'mmap', 'modulefinder', 'msvcrt', 'multiprocessing', 'netrc', 'nt', 'ntpath',
  'nturl2path', 'numbers', 'opcode', 'operator', 'optparse', 'os', 'pathlib', 'pdb', 'pickle', 'pickletools',
  'pkgutil', 'platform', 'plistlib', 'poplib', 'posix', 'posixpath', 'pprint', 'profile', 'pstats', 'pty', 'pwd',
  'py_compile', 'pyclbr', 'pydoc', 'pydoc_data', 'pyexpat', 'queue', 'quopri', 'random', 're', 'readline', 'reprlib',
  'resource', 'rlcompleter', 'runpy', 'sched', 'secrets', 'select', 'selectors', 'shelve', 'shlex', 'shutil',
  'signal', 'site', 'smtplib', 'socket', 'socketserver', 'sqlite3', 'sre_compile', 'sre_constants', 'sre_parse',
  'ssl', 'stat', 'statistics', 'string', 'stringprep', 'struct', 'subprocess', 'symtable', 'sys', 'sysconfig',
  'syslog', 'tabnanny', 'tarfile', 'tempfile', 'termios', 'textwrap', 'this', 'threading', 'time', 'timeit',
  'tkinter', 'token', 'tokenize', 'tomllib', 'trace', 'traceback', 'tracemalloc', 'tty', 'turtle', 'turtledemo',
  'types', 'typing', 'unicodedata', 'unittest', 'urllib', 'uuid', 'venv', 'warnings', 'wave', 'weakref',
  'webbrowser', 'winreg', 'winsound', 'wsgiref', 'xml', 'xmlrpc', 'zipapp', 'zipfile', 'zipimport', 'zlib',
  'zoneinfo',
]);

/** True for `fs` and `node:fs`. Callers reduce `fs/promises` to its first segment before asking. */
export function isNodeBuiltin(name: string): boolean {
  return name.startsWith('node:') || NODE_BUILTINS.has(name);
}

export function isPythonStdlib(name: string): boolean {
  return PYTHON_STDLIB.has(name);
}
