import { baseName } from '../../components/usePdfFiles.js'
import { formatBytes, plural } from './structure-shared.jsx'

function Options() {
  return (
    <>
      <p className="field-help">Every picture in the file is removed: photos, logos, scanned page images, inline images, and pictures inside patterns and comment stamps. Text, lines and shapes stay where they are.</p>
      <p className="st-warn">A scanned PDF is all picture: removing images leaves its pages blank, apart from any OCR text.</p>
    </>
  )
}

export default {
  id: 'removeimages',
  name: 'Remove images',
  io: 'PDF → text-only PDF',
  description: 'Drop pictures, keep text and vector art.',
  category: 'Optimize',
  icon: 'imageoff',
  accepts: { min: 1 },
  defaults: {},
  next: ['compress', 'pdf2word', 'merge'],
  Options,
  summary(files) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Remove images' }
    return { ready: true, line: `${plural(files.length, 'PDF')} will be saved without images.`, runLabel: `Remove images from ${plural(files.length, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [k, f] of files.entries()) {
      ctx.check()
      ctx.progress(k, files.length, f.name)
      const before = f.bytes.byteLength
      const res = await ctx.call('doc', 'removeImages', f.bytes)
      const saved = `${formatBytes(Math.max(0, before - res.bytes.byteLength))} saved`
      const note = res.pages
        ? `Images removed on ${plural(res.pages, 'page')}, ${saved}.`
        : res.blanked
          ? `Images in patterns or comments removed, ${saved}.`
          : res.loose
            ? `${plural(res.loose, 'image')} left over from an earlier version of the file removed, ${saved}.`
            : 'No images found, the file is unchanged.'
      outputs.push({ name: `${baseName(f.name)}-no-images.pdf`, bytes: res.bytes, parentIds: [f.id], before, note, unchanged: !res.pages && !res.blanked && !res.loose })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
