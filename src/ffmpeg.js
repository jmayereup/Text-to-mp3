const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

// Keep temp directory within the workspace as requested by system rules.
const TEMP_DIR = path.join(__dirname, '..', 'temp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Compresses an input audio buffer using FFmpeg to a low-bitrate VBR MP3 (mono, ~50kbps, 22050Hz).
 * @param {Buffer} inputBuffer The raw audio buffer from OpenRouter.
 * @returns {Promise<{buffer: Buffer, originalSize: number, compressedSize: number}>}
 */
function compressToMp3(inputBuffer) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const tempInput = path.join(TEMP_DIR, `input_${timestamp}_${randomSuffix}.tmp`);
    const tempOutput = path.join(TEMP_DIR, `output_${timestamp}_${randomSuffix}.mp3`);

    // Write input buffer to temporary file
    try {
      fs.writeFileSync(tempInput, inputBuffer);
    } catch (err) {
      return reject(new Error(`Failed to write temp input file: ${err.message}`));
    }

    // Check if the input is MP3 or raw PCM.
    // MP3 starts with ID3 tag (0x49 0x44 0x33) or a sync frame (0xFF and 0xE0-0xFF)
    const isMp3 = (
      inputBuffer.length >= 3 &&
      inputBuffer[0] === 0x49 &&
      inputBuffer[1] === 0x44 &&
      inputBuffer[2] === 0x33
    ) || (
      inputBuffer.length >= 2 &&
      inputBuffer[0] === 0xFF &&
      (inputBuffer[1] & 0xE0) === 0xE0
    );

    // FFmpeg arguments:
    // -y: overwrite output files without asking
    const args = ['-y'];

    // If it's raw PCM, we must specify the input format flags BEFORE -i
    if (!isMp3) {
      args.push('-f', 's16le', '-ar', '24000', '-ac', '1');
    }

    args.push('-i', tempInput);

    // Output settings:
    // -codec:a libmp3lame: use LAME MP3 encoder
    // -q:a 9: LAME VBR quality level 9 (~65kbps average, lowest VBR setting)
    // -ar 22050: set sample rate to 22.05 kHz (great for voice, reduces size)
    // -ac 1: convert to mono channel (saves ~50% size compared to stereo)
    args.push(
      '-codec:a', 'libmp3lame',
      '-q:a', '9',
      '-ar', '22050',
      '-ac', '1',
      tempOutput
    );

    // Spawn FFmpeg process
    const ffmpegProcess = spawn(ffmpegPath, args);

    let stderrData = '';
    ffmpegProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    ffmpegProcess.on('error', (err) => {
      cleanupFiles([tempInput, tempOutput]);
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });

    ffmpegProcess.on('close', (code) => {
      if (code !== 0) {
        cleanupFiles([tempInput, tempOutput]);
        return reject(new Error(`FFmpeg exited with code ${code}. Stderr: ${stderrData}`));
      }

      try {
        // Read compressed file
        const compressedBuffer = fs.readFileSync(tempOutput);
        const originalSize = inputBuffer.length;
        const compressedSize = compressedBuffer.length;

        // Cleanup files asynchronously
        cleanupFiles([tempInput, tempOutput]);

        resolve({
          buffer: compressedBuffer,
          originalSize,
          compressedSize
        });
      } catch (err) {
        cleanupFiles([tempInput, tempOutput]);
        reject(new Error(`Failed to read output file: ${err.message}`));
      }
    });
  });
}

/**
 * Utility to delete temporary files safely.
 */
function cleanupFiles(filePaths) {
  filePaths.forEach((filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error(`Failed to cleanup file ${filePath}:`, err.message);
    }
  });
}

module.exports = {
  compressToMp3,
  TEMP_DIR
};
