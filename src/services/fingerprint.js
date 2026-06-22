/**
 * Audio fingerprinting service for copyright risk detection.
 *
 * Current implementation: SHA-256 hash of the uploaded file (fast, exact-duplicate detection).
 * Next step: integrate Chromaprint / AcoustID for perceptual audio fingerprinting.
 *
 * Perceptual fingerprinting requires:
 * - chromaprint library or fpcalc binary
 * - AcoustID API key for lookup
 * - local reference database of known/claimed tracks
 */

const crypto = require('crypto');
const fs = require('fs');

function computeFileHash(filePath) {
    try {
        if (!filePath || !fs.existsSync(filePath)) return null;
        const hash = crypto.createHash('sha256');
        hash.update(fs.readFileSync(filePath));
        return hash.digest('hex');
    } catch (error) {
        console.error('File hash error:', error);
        return null;
    }
}

async function computeFingerprint(filePath) {
    // Placeholder for perceptual fingerprinting.
    // Returns the SHA-256 hash as a basic fingerprint.
    return computeFileHash(filePath);
}

async function lookupFingerprint(fingerprint) {
    // Placeholder: in production, query AcoustID or an internal reference database.
    return {
        matched: false,
        confidence: 0,
        source: null
    };
}

module.exports = {
    computeFileHash,
    computeFingerprint,
    lookupFingerprint
};
