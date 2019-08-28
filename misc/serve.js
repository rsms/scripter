#!/usr/bin/env node
// servedir HTTP Server
// http://github.com/rem/servedir
// Copyright 2011, Remy Sharp
// http://remysharp.com

const livereload = require('livereload');
let livereloadPort = 35729

// Convenience aliases.
const createServer = require('http').createServer
const parse = require('url').parse
const Path = require('path')
const fs = require('fs')

// Matches control characters in URLs.
const escapable = /[\x00-\x1f\x7f"'&?$\x20+,:;=@<>#%{}|\\\^~\[\]`]/g

// Escape sequences and entities for control characters.
const escapes = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&apos;'
}

var types;

fs.exists || (fs.exists = Path.exists);


function serveDirListing(res, path, pathname) {
  // Automatically append a trailing slash for directories.
  if (pathname.charAt(pathname.length - 1) != '/') pathname += '/';
  fs.readdir(path, function(err, files) {
    if (err) {
      res.writeHead(500, {'Content-Type': 'text/plain'})
      res.end('An internal server error occurred: ' + err)
      return
    }

    // Create a basic directory listing.
    files = files.map(function(name) {
      // URL-encode the path to each file or directory.
      return '<a href="' + (pathname + name).replace(escapable, function(match) {
        // Cache escape sequences not already in the escapes hash.
        return escapes[match] || (escapes[match] = '%' + match.charCodeAt(0).toString(16));
      }) + '">' + name + '</a>';
    })

    if (pathname != '/') {
      // Add a link to the root directory
      files.unshift('<a href="..">..</a>')
    }

    res.writeHead(200, {'Content-Type': 'text/html'})
    res.end(
      `<!DOCTYPE html>
      <html>
        <meta charset="utf-8">
        <title>[dir]${pathname}</title>
        <body>
          <ul><li>${files.join('<li>')}</ul>
        </body>
      </html>`)
  })
}


function serveDir(res, path, pathname, options) {
  if (options.alwaysListDirs) {
    serveDirListing(res, path, pathname)
  } else {
    // try "<dir>/index.html"
    var indexFile = Path.join(path, 'index.html')
    fs.stat(indexFile, function(err, stats) {
      if (!err && stats.isFile()) {
        serveFile(res, indexFile, stats, options)
      } else {
        serveDirListing(res, path, pathname)
      }
    })
  }
}


function serveFile(res, path, stats, options) {
  res.statusCode = 200;
  // Set the correct MIME type using the extension.
  let ext = Path.extname(path).slice(1);
  let mimeType = types[ext] || servedir.defaultType;
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Last-Modified', stats.mtime.toUTCString());
  res.setHeader('ETag', `"${stats.mtime.getTime().toString(36)}-${stats.ino.toString(36)}-${stats.size.toString(36)}"`);
  if (options.expireImmediately) {
    res.setHeader('Expires', 'Sun, 11 Mar 1984 12:00:00 GMT')
  }
  try {
    let content = fs.readFileSync(path);
    if (mimeType == "text/html") {
      // add livereload script to html
      let s = content.toString("utf8")
      let i = s.indexOf("</head>")
      if (i == -1) { i = s.indexOf("</body>") }
      if (i != -1) {
        let livereloadScript = `<script async src="http://127.0.0.1:${options.port}/livereload.js?port=${livereloadPort}"></script>`
        s = s.substr(0, i) + livereloadScript + s.substr(i)
        content = Buffer.from(s, "utf8")
      }
    }
    res.setHeader('Content-Length', content.length);
    if (options.emulateSlowConnection) {
      let chunkTime = 1000; // Stream each file out over a second
      let chunkCount = 100; // The number of chunks to deliver the file in
      let chunkSize = Math.ceil(content.length / chunkCount);
      function next() {
        if (content.length > 0) {
          res.write(content.slice(0, chunkSize));
          content = content.slice(chunkSize);
          setTimeout(next, chunkTime / chunkCount);
        } else {
          res.end();
        }
      }
      next();
    } else {
      res.end(content);
    }
  } catch (err) {
    console.error(err.stack||String(err))
    // Internal server error; avoid throwing an exception.
    res.writeHead(500, {'Content-Type': 'text/plain'})
    res.end('An internal server error occurred: ' + err)
  }
}

let livereloadData = undefined

function serveLivereload(res, options) {
  if (!livereloadData) {
    livereloadData = fs.readFileSync(__dirname + "/livereload.min.js");
  }
  res.setHeader('Content-Type', "text/javascript");
  res.setHeader('Content-Length', livereloadData.length);
  res.setHeader('Expires', 'Fri, 1 Jan 2038 12:00:00 GMT')
  res.end(livereloadData);
}


// The `servedir` function creates a new simple HTTP server.
var servedir = module.exports = function(root, port, options) {
  if (typeof root != 'string') root = servedir.defaultRoot;
  if (typeof port != 'number') port = servedir.defaultPort;

  if (options === undefined) options = {};

  options.port = port

  // If this socket will be opened to the local network, only allow serving a
  // directory inside the home directory. Prevent people from serving up their
  // SSH keys to the local network unintentionally.
  if (options.allowExternalAccess) {
    var home = process.env.HOME;

    // Make sure the environment variable exists
    if (!home) {
      process.stderr.write('refusing to allow external access without a home directory for security reasons\n');
      process.exit(1);
    }

    // Compare normalized, absolute paths
    home = Path.normalize(Path.resolve(home));
    var normalized = Path.normalize(Path.resolve(root));

    // The root path must be contained inside the home directory
    for (var previous = normalized, next; (next = Path.dirname(previous)) !== previous; previous = next) {
      if (next === home) {
        break;
      }
    }

    // If the root path is equal to or outside the home directory, refuse to run
    if (previous === next) {
      process.stderr.write('refusing to allow external access to a directory not contained inside your home directory for security reasons\n');
      process.exit(1);
    }

    // Not sure why someone would do this but it's not a good idea
    if (normalized === Path.join(home, '.ssh')) {
      process.stderr.write('refusing to allow external access to your SSH keys for security reasons\n');
      process.exit(1);
    }
  }

  // Create livereload server
  const livereloadServer = livereload.createServer({
    port: livereloadPort,
  });
  livereloadServer.watch(root);

  // Create a new HTTP server.
  var server = createServer(function(req, res) {
    // Resolve the path to the requested file or folder.

    var end = res.end,
        writeHead = res.writeHead,
        statusCode;

    // taken rather liberally from Connect's logger.
    if (!options.quiet) {
      // proxy for statusCode.
      res.writeHead = function(code, headers){
        res.writeHead = writeHead;
        res.writeHead(code, headers);
        res.__statusCode = statusCode = code;
        res.__headers = headers || {};
      };

      res.end = function(chunk, encoding) {
        res.end = end;
        res.end(chunk, encoding);

        console.log((req.socket && (req.socket.remoteAddress || (req.socket.socket && req.socket.socket.remoteAddress)))
           + ' [' + (new Date).toUTCString() + ']'
           + ' "' + req.method + ' ' + req.url
           + ' HTTP/' + req.httpVersionMajor + '.' + req.httpVersionMinor + '" '
           + (statusCode || res.statusCode)) + ' ' + (req.headers['user-agent'] || '-');
      };
    }

    var pathname = decodeURIComponent(parse(req.url).pathname)
    pathname = pathname.replace(/^\.{2,}|\.{2,}$/g, '')
    var file = Path.join(root, pathname)

    // Only allow writing over files if the server can only accept local connections
    if (req.method === 'POST' && !options.allowExternalAccess) {
      var origin = req.headers.origin && parse(req.headers.origin).hostname;
      if (origin !== 'localhost' && origin !== '127.0.0.1') {
        res.writeHead(403, {'Content-Type': 'text/plain'});
        res.end('Forbidden.');
      } else {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        var body = [];
        req.on('data', function(data) {
          body.push(data);
        });
        req.on('end', function() {
          fs.writeFile(file, Buffer.concat(body), function(err) {
            if (err) {
              res.writeHead(500, {'Content-Type': 'text/plain'});
              res.end('An internal server error occurred: ' + err);
            } else {
              res.writeHead(200, {'Content-Type': 'text/plain'});
              res.end('Post successful.');
            }
          });
        });
      }
    }

    else if (req.method === 'GET') {
      fs.stat(file, function(err, stats) {

        if (err) {
          if (err.code == 'ENOENT') {
            if (pathname == "/livereload.js") {
              serveLivereload(res, options)
            } else {
              res.writeHead(404, {'Content-Type': 'text/plain'})
              res.end('404 not found: ' + pathname)
            }
          } else {
            res.writeHead(500, {'Content-Type': 'text/plain'})
            res.end('An internal server error occurred: ' + err)
          }
          return
        }

        // File
        if (stats.isFile()) {
          serveFile(res, file, stats, options)
        } else if (stats.isDirectory()) {
          serveDir(res, file, pathname, options)
        } else {
          res.writeHead(404, {'Content-Type': 'text/plain'})
          res.end('404 not found (unreadable file type): ' + pathname)
        }
      });
    }

    else {
      res.writeHead(500, {'Content-Type': 'text/plain'});
      res.end('Unsupported method: ' + req.method);
    }
  });
  server.listen(port, options.allowExternalAccess ? null : 'localhost', function() {
    let host = options.allowExternalAccess ? '*' : 'localhost'
    console.log(`serving ${Path.relative(".", root)} on http://${host}:${port}`)
  });
  return server;
};

// The current version of `servedir`. Keep in sync with `package.json`.
servedir.version = '0.1.10';

// The default MIME type, root directory, and port.
servedir.defaultType = 'application/octet-stream';
servedir.defaultRoot = '.';
servedir.defaultPort = 8000;

// Common MIME types.
servedir.types = types = {
  'aiff': 'audio/x-aiff',
  'appcache': 'text/cache-manifest',
  'atom': 'application/atom+xml',
  'bmp': 'image/bmp',
  'crx': 'application/x-chrome-extension',
  'css': 'text/css',
  'eot': 'application/vnd.ms-fontobject',
  'gif': 'image/gif',
  'htc': 'text/x-component',
  'html': 'text/html',
  'ico': 'image/vnd.microsoft.icon',
  'ics': 'text/calendar',
  'jpeg': 'image/jpeg',
  'js': 'text/javascript',
  'json': 'application/json',
  'mathml': 'application/mathml+xml',
  'md': 'text/markdown',
  'midi': 'audio/midi',
  'mov': 'video/quicktime',
  'mp3': 'audio/mpeg',
  'mp4': 'video/mp4',
  'mpeg': 'video/mpeg',
  'ogg': 'video/ogg',
  'otf': 'font/opentype',
  'pdf': 'application/pdf',
  'png': 'image/png',
  'rtf': 'application/rtf',
  'sh': 'application/x-sh',
  'svg': 'image/svg+xml',
  'swf': 'application/x-shockwave-flash',
  'tar': 'application/x-tar',
  'tiff': 'image/tiff',
  'ttf': 'font/truetype',
  'txt': 'text/plain',
  'wav': 'audio/x-wav',
  'webm': 'video/webm',
  'wasm': 'application/wasm',
  'webp': 'image/webp',
  'woff': 'font/woff',
  'xhtml': 'application/xhtml+xml',
  'xml': 'text/xml',
  'xsl': 'application/xml',
  'xslt': 'application/xslt+xml',
  'zip': 'application/zip',
};

// MIME type aliases for different extensions.
types.aif = types.aiff;
types.htm = types.html;
types.jpe = types.jpg = types.jpeg;
types.jsonp = types.js;
types.manifest = types.appcache;
types.markdown = types.markdn = types.mdown = types.mdml = types.md;
types.mid = types.midi;
types.mpg = types.mpeg;
types.ogv = types.ogg;
types.rb = types.txt;
types.svgz = types.svg;
types.tif = types.tiff;
types.xht = types.xhtml;
types.php = types.html;

if (typeof module == 'undefined' || module.id == '.') {
  let port = parseInt(process.argv[3])
  if (isNaN(port) || port < 1) {
    port = 8008
  } else {
    livereloadPort = 20000 + port
  }
  let dir = Path.resolve(process.argv[2] || __dirname + "/../docs")
  try {
    fs.realpathSync(dir)  // throws on error
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
  servedir(dir, port, {
    quiet: true,
    expireImmediately: true,
  })
}
