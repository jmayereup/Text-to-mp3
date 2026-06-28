const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

console.log('Static FFmpeg binary path resolved to:', ffmpegPath);

const proc = spawn(ffmpegPath, ['-version']);
let output = '';

proc.stdout.on('data', (data) => {
  output += data.toString();
});

proc.stderr.on('data', (data) => {
  output += data.toString();
});

proc.on('close', (code) => {
  if (code === 0) {
    console.log('SUCCESS: FFmpeg loaded successfully and returned version output:');
    console.log(output.split('\n')[0]); // Print first line of version
  } else {
    console.error(`FAILURE: FFmpeg exited with code ${code}. Output:`);
    console.error(output);
  }
});
