/**
 * HTTP Signature Implementation for ActivityPub
 * Implements signing and verification of HTTP requests per the HTTP Signatures spec
 * https://datatracker.ietf.org/doc/html/draft-cavage-http-signatures-12
 */

/**
 * Sign an HTTP request for ActivityPub delivery
 * @param {Object} options - Signing options
 * @param {string} options.keyId - The key ID (actor's public key URL)
 * @param {string} options.privateKey - The RSA private key in PEM format
 * @param {string} options.method - HTTP method (GET, POST, etc)
 * @param {string} options.url - Full URL of the request
 * @param {Object} options.headers - Headers to sign (must include Date and Host)
 * @param {string} options.body - Request body (for digest calculation)
 * @returns {Object} Headers with Signature added
 */
export async function signRequest(options) {
  const { keyId, privateKey, method, url, headers = {}, body = '' } = options;
  
  // Parse URL to get path and host
  const urlObj = new URL(url);
  const path = urlObj.pathname + urlObj.search;
  const host = urlObj.host;
  
  // Ensure required headers exist
  const signedHeaders = {
    ...headers,
    'Host': host,
    'Date': headers['Date'] || new Date().toUTCString()
  };
  
  // Add digest header if there's a body
  if (body) {
    const digest = await calculateDigest(body);
    signedHeaders['Digest'] = `SHA-256=${digest}`;
  }
  
  // Headers to include in signature (order matters)
  const headersToSign = body 
    ? ['(request-target)', 'host', 'date', 'digest']
    : ['(request-target)', 'host', 'date'];
  
  // Build the signing string
  const signingString = buildSigningString(method, path, signedHeaders, headersToSign);
  
  // Sign the string
  const signature = await createSignature(signingString, privateKey);
  
  // Build the Signature header
  signedHeaders['Signature'] = buildSignatureHeader(keyId, headersToSign, signature);
  
  return signedHeaders;
}

/**
 * Verify an HTTP signature on an incoming request
 * @param {Request} request - The incoming request
 * @param {Function} getPublicKey - Async function to fetch public key by keyId
 * @returns {Promise<boolean>} True if signature is valid
 */
export async function verifySignature(request, getPublicKey) {
  try {
    const signatureHeader = request.headers.get('Signature');
    if (!signatureHeader) {
      return false;
    }
    
    // Parse the signature header
    const { keyId, headers: signedHeaders, signature } = parseSignatureHeader(signatureHeader);
    
    // Get the public key for this keyId
    const publicKey = await getPublicKey(keyId);
    if (!publicKey) {
      return false;
    }
    
    // Rebuild the signing string
    const method = request.method.toLowerCase();
    const url = new URL(request.url);
    const path = url.pathname + url.search;
    
    const requestHeaders = {};
    for (const [key, value] of request.headers.entries()) {
      requestHeaders[key.toLowerCase()] = value;
    }
    
    const signingString = buildSigningString(method, path, requestHeaders, signedHeaders);
    
    // Verify the signature
    return await verifySignatureString(signingString, signature, publicKey);
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Calculate SHA-256 digest of content
 * @param {string} content - Content to digest
 * @returns {Promise<string>} Base64-encoded digest
 */
async function calculateDigest(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashBase64 = btoa(String.fromCharCode(...hashArray));
  return hashBase64;
}

/**
 * Build the signing string from request components
 * @param {string} method - HTTP method (lowercase)
 * @param {string} path - Request path including query string
 * @param {Object} headers - Request headers
 * @param {Array} headersToSign - List of headers to include in signature
 * @returns {string} The signing string
 */
function buildSigningString(method, path, headers, headersToSign) {
  const lines = [];
  
  for (const header of headersToSign) {
    if (header === '(request-target)') {
      lines.push(`(request-target): ${method.toLowerCase()} ${path}`);
    } else {
      const value = headers[header] || headers[header.toLowerCase()];
      if (value) {
        lines.push(`${header.toLowerCase()}: ${value}`);
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * Create RSA-SHA256 signature
 * @param {string} signingString - The string to sign
 * @param {string} privateKey - RSA private key in PEM format
 * @returns {Promise<string>} Base64-encoded signature
 */
async function createSignature(signingString, privateKey) {
  // Import the private key
  const key = await importPrivateKey(privateKey);
  
  // Sign the string
  const encoder = new TextEncoder();
  const data = encoder.encode(signingString);
  const signatureBuffer = await crypto.subtle.sign(
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    key,
    data
  );
  
  // Convert to base64
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return btoa(String.fromCharCode(...signatureArray));
}

/**
 * Import RSA private key from PEM format
 * @param {string} pem - Private key in PEM format
 * @returns {Promise<CryptoKey>} Imported key
 */
async function importPrivateKey(pem) {
  // Remove PEM headers and newlines
  const pemContents = pem
    .replace('-----BEGIN RSA PRIVATE KEY-----', '')
    .replace('-----END RSA PRIVATE KEY-----', '')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  
  // Decode base64
  const binaryDer = atob(pemContents);
  const binaryDerArray = new Uint8Array(binaryDer.length);
  for (let i = 0; i < binaryDer.length; i++) {
    binaryDerArray[i] = binaryDer.charCodeAt(i);
  }
  
  // Import as PKCS8
  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDerArray.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );
}

/**
 * Import RSA public key from PEM format
 * @param {string} pem - Public key in PEM format
 * @returns {Promise<CryptoKey>} Imported key
 */
async function importPublicKey(pem) {
  // Remove PEM headers and newlines
  const pemContents = pem
    .replace('-----BEGIN RSA PUBLIC KEY-----', '')
    .replace('-----END RSA PUBLIC KEY-----', '')
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  
  // Decode base64
  const binaryDer = atob(pemContents);
  const binaryDerArray = new Uint8Array(binaryDer.length);
  for (let i = 0; i < binaryDer.length; i++) {
    binaryDerArray[i] = binaryDer.charCodeAt(i);
  }
  
  // Import as SPKI
  return await crypto.subtle.importKey(
    'spki',
    binaryDerArray.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['verify']
  );
}

/**
 * Verify RSA-SHA256 signature
 * @param {string} signingString - The original signed string
 * @param {string} signature - Base64-encoded signature
 * @param {string} publicKey - RSA public key in PEM format
 * @returns {Promise<boolean>} True if signature is valid
 */
async function verifySignatureString(signingString, signature, publicKey) {
  try {
    // Import the public key
    const key = await importPublicKey(publicKey);
    
    // Decode the signature
    const signatureBinary = atob(signature);
    const signatureArray = new Uint8Array(signatureBinary.length);
    for (let i = 0; i < signatureBinary.length; i++) {
      signatureArray[i] = signatureBinary.charCodeAt(i);
    }
    
    // Verify the signature
    const encoder = new TextEncoder();
    const data = encoder.encode(signingString);
    
    return await crypto.subtle.verify(
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256'
      },
      key,
      signatureArray.buffer,
      data
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Build the Signature header value
 * @param {string} keyId - The key ID
 * @param {Array} headers - Headers included in signature
 * @param {string} signature - Base64-encoded signature
 * @returns {string} Signature header value
 */
function buildSignatureHeader(keyId, headers, signature) {
  return `keyId="${keyId}",headers="${headers.join(' ')}",signature="${signature}",algorithm="rsa-sha256"`;
}

/**
 * Parse the Signature header value
 * @param {string} header - Signature header value
 * @returns {Object} Parsed components
 */
function parseSignatureHeader(header) {
  const parts = {};
  const regex = /(\w+)="([^"]+)"/g;
  let match;
  
  while ((match = regex.exec(header)) !== null) {
    parts[match[1]] = match[2];
  }
  
  return {
    keyId: parts.keyId,
    headers: parts.headers ? parts.headers.split(' ') : [],
    signature: parts.signature,
    algorithm: parts.algorithm || 'rsa-sha256'
  };
}

/**
 * Generate a new RSA key pair for ActivityPub
 * @returns {Promise<Object>} Object with privateKey and publicKey in PEM format
 */
export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['sign', 'verify']
  );
  
  // Export keys to PEM format
  const privateKey = await exportPrivateKey(keyPair.privateKey);
  const publicKey = await exportPublicKey(keyPair.publicKey);
  
  return { privateKey, publicKey };
}

/**
 * Export private key to PEM format
 * @param {CryptoKey} key - Private key
 * @returns {Promise<string>} PEM-formatted private key
 */
async function exportPrivateKey(key) {
  const exported = await crypto.subtle.exportKey('pkcs8', key);
  const exportedArray = new Uint8Array(exported);
  const exportedBase64 = btoa(String.fromCharCode(...exportedArray));
  
  // Format as PEM
  const pemLines = [];
  pemLines.push('-----BEGIN PRIVATE KEY-----');
  for (let i = 0; i < exportedBase64.length; i += 64) {
    pemLines.push(exportedBase64.substr(i, 64));
  }
  pemLines.push('-----END PRIVATE KEY-----');
  
  return pemLines.join('\n');
}

/**
 * Export public key to PEM format
 * @param {CryptoKey} key - Public key
 * @returns {Promise<string>} PEM-formatted public key
 */
async function exportPublicKey(key) {
  const exported = await crypto.subtle.exportKey('spki', key);
  const exportedArray = new Uint8Array(exported);
  const exportedBase64 = btoa(String.fromCharCode(...exportedArray));
  
  // Format as PEM
  const pemLines = [];
  pemLines.push('-----BEGIN PUBLIC KEY-----');
  for (let i = 0; i < exportedBase64.length; i += 64) {
    pemLines.push(exportedBase64.substr(i, 64));
  }
  pemLines.push('-----END PUBLIC KEY-----');
  
  return pemLines.join('\n');
}