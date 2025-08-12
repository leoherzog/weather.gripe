# HTTP Signatures Implementation

This document describes the HTTP Signatures implementation for ActivityPub federation in Weather.gripe.

## Overview

HTTP Signatures provide cryptographic authentication for ActivityPub messages, ensuring that:
1. Messages come from the claimed sender
2. Messages haven't been tampered with in transit
3. Other servers can trust our weather posts

## Implementation Details

### Key Management

Weather.gripe uses RSA-2048 key pairs for signing:
- **Private keys**: Stored securely in Cloudflare KV namespace `KEYS`
- **Public keys**: Exposed in actor objects at `/locations/{location}#main-key`
- **Automatic generation**: Keys are created on-demand when first needed

### Signing Outgoing Requests

All outgoing ActivityPub activities are signed using the `signRequest()` function:

```javascript
const signedHeaders = await signRequest({
  keyId: 'https://weather.gripe/locations/newyork#main-key',
  privateKey: privateKeyPEM,
  method: 'POST',
  url: 'https://mastodon.social/inbox',
  headers: {
    'Content-Type': 'application/activity+json',
    'Date': new Date().toUTCString()
  },
  body: JSON.stringify(activity)
});
```

#### Signed Headers
The following headers are included in signatures:
- `(request-target)`: Special pseudo-header containing HTTP method and path
- `host`: Target server hostname
- `date`: Request timestamp (must be within 5 minutes)
- `digest`: SHA-256 hash of request body (for POST requests)

#### Signature Header Format
```
Signature: keyId="https://weather.gripe/locations/newyork#main-key",
          headers="(request-target) host date digest",
          signature="base64_encoded_signature",
          algorithm="rsa-sha256"
```

### Verifying Incoming Requests

Incoming activities to inbox endpoints are verified:

1. Extract signature components from `Signature` header
2. Fetch sender's public key from their actor object
3. Rebuild the signing string from request data
4. Verify signature using RSA-SHA256

```javascript
const isValid = await verifySignature(request, async (keyId) => {
  // Fetch public key from remote actor
  const actorUrl = keyId.replace('#main-key', '');
  const response = await fetch(actorUrl);
  const actor = await response.json();
  return actor.publicKey?.publicKeyPem;
});
```

### Digest Calculation

For POST requests with bodies, a `Digest` header is added:
```
Digest: SHA-256=base64_encoded_hash
```

This ensures the body hasn't been modified in transit.

## Security Considerations

### Key Storage
- Private keys are stored in Cloudflare KV with no expiration
- Keys are only accessible to the worker runtime
- Each location has its own key pair

### Signature Validation
- Currently lenient with signature verification failures (logs warning but accepts)
- This ensures compatibility with servers that might have implementation differences
- Can be made strict once thoroughly tested with major ActivityPub implementations

### Time Window
- Date headers should be within 5 minutes of current time
- Prevents replay attacks with old signed requests

## Compatibility

Tested and compatible with:
- Mastodon 4.x
- Planned testing with Pleroma, Misskey, and other ActivityPub servers

## Implementation Files

- **`src/utils/http-signature.js`**: Core signing and verification logic
- **`src/services/delivery-service.js`**: Integration for outgoing messages
- **`src/handlers/activitypub.js`**: Verification for incoming messages

## Testing

Comprehensive tests are available in:
- `tests/integration/delivery-service.test.js`: Signing tests
- `tests/integration/activitypub.test.js`: Verification tests
- `tests/e2e/mastodon-interaction.test.js`: Full flow tests

## Standards Compliance

Implementation follows:
- [draft-cavage-http-signatures-12](https://datatracker.ietf.org/doc/html/draft-cavage-http-signatures-12)
- [ActivityPub Authentication](https://www.w3.org/wiki/SocialCG/ActivityPub/Authentication_Authorization)

## Troubleshooting

### Common Issues

1. **"Invalid signature" warnings**: Check that public key is correctly formatted in actor object
2. **Signature verification failures**: Ensure Date header is recent (within 5 minutes)
3. **Missing Digest header**: Body must be included for digest calculation

### Debug Logging

Enable debug logging to see signature details:
```javascript
logger.debug('Signature components', {
  keyId,
  headers: signedHeaders,
  signingString
});
```

## Future Improvements

- [ ] Support for HS2019 algorithm (newer HTTP Signatures draft)
- [ ] Key rotation mechanism
- [ ] Strict signature verification mode
- [ ] Support for multiple keys per actor
- [ ] Caching of remote actor public keys