const fs = require('node:fs')
const path = require('node:path')
const { generateMobileV969x16Poster } = require('../poster/render_mobile_v9_6_9x16')

async function renderFile(inputPath, outputPath) {
  if (!inputPath) throw new Error('用法: node renderer/render.js <poster-data.json> [poster.png]')
  const source = path.resolve(inputPath)
  const destination = path.resolve(outputPath || 'poster.png')
  const data = JSON.parse(fs.readFileSync(source, 'utf8'))
  await generateMobileV969x16Poster(data, { outputPath: destination })
  process.stdout.write(`${destination}\n`)
}

if (require.main === module) {
  renderFile(process.argv[2], process.argv[3]).catch((error) => {
    process.stderr.write(`${error.stack || error}\n`)
    process.exitCode = 1
  })
}

module.exports = { renderFile }
