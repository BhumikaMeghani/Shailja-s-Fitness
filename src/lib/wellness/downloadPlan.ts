/**
 * Client-side export of a generated Personalised Yoga Plan to PDF or Word.
 * Pure-browser building (no server round-trip): the same text engine output
 * shown in the dialog is laid out into a print-style document. Pose photos
 * from `/yoga-poses/` are embedded as small thumbnails when reachable; a
 * missing image simply falls back to text.
 */
import { jsPDF } from 'jspdf'
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import { GOAL_LABELS } from '~/lib/wellness/goals'
import { calculatePlanPrice, formatInr } from '~/lib/wellness/pricing'
import { poseImageFor } from '~/lib/wellness/yogaImages'
import imageManifest from '~/lib/image-manifest.json'
import type { FoodSelection, WellnessPlan } from '~/lib/wellness/types'

const IMAGE_MAX_PIXELS = 240

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const fileSafeName = (name: string) =>
  (name.trim() || 'yoga-plan').replace(/[^\p{L}\p{N}\-_]+/gu, '-').replace(/^-+|-+$/g, '') || 'yoga-plan'

/** Load (and downscale) a pose thumbnail as JPEG for embedding. */
async function loadImageThumbnail(src: string): Promise<{ blob: Uint8Array; width: number; height: number } | null> {
  const variants = (imageManifest as Record<string, { variants: { src: string; width: number }[] }>)[src]?.variants
  const optimized = variants?.find(image => image.width >= IMAGE_MAX_PIXELS) ?? variants?.at(-1)
  // Retry the original on HTTP, network or decoding failure (including browsers
  // without WebP support). Only omit the image if neither source is usable.
  for (const candidate of optimized ? [optimized.src, src] : [src]) {
    let objectUrl: string | undefined
    try {
      const response = await fetch(candidate)
      if (!response.ok) continue
      const raw = await response.blob()
      const url = URL.createObjectURL(raw)
      objectUrl = url
      const bitmap = await new Promise<HTMLImageElement | null>(resolve => {
        const image = new Image()
        image.crossOrigin = 'anonymous'
        image.onload = () => resolve(image)
        image.onerror = () => resolve(null)
        image.src = url
      })
      if (!bitmap || !bitmap.width || !bitmap.height) continue
      const scale = Math.min(1, IMAGE_MAX_PIXELS / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return null
      context.drawImage(bitmap, 0, 0, width, height)
      const jpeg = canvas.toDataURL('image/jpeg', 0.72)
      const bytes = Uint8Array.from(atob(jpeg.split(',')[1]), char => char.charCodeAt(0))
      return { blob: bytes, width, height }
    } catch {
      // Try the next source; plan text is still exportable if both fail.
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

/**
 * jsPDF core fonts are Latin-1 only. Translate the few typographic
 * characters the wellness copy uses so PDFs stay readable.
 */
function toPdfText(value: string): string {
  return value
    .replace(/[–—]/g, ' - ')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/₹/g, 'Rs. ')
    .replace(/≈/g, '~')
    .replace(/·/g, ' - ')
    .replace(/&c\.?/g, '')
    .replace(/[^\u0000-\u00ff]/g, '')
}

export async function downloadPlanPdf(plan: WellnessPlan, userName: string): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 14
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const textWidth = pageWidth - margin * 2
  const price = calculatePlanPrice(plan.selectedGoals)
  let y = margin

  const ensureSpace = (needed: number) => {
    if (y + needed <= pageHeight - margin) return
    doc.addPage()
    y = margin
  }

  const heading = (text: string, size: number, gapAfter = 3) => {
    ensureSpace(size * 0.6 + gapAfter)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(text, textWidth)
    lines.forEach((line: string) => {
      ensureSpace(size * 0.6)
      doc.text(toPdfText(line), margin, y)
      y += size * 0.55
    })
    y += gapAfter
  }

  const body = (text: string, options: { bold?: boolean; indent?: number; list?: boolean; size?: number } = {}) => {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal')
    doc.setFontSize(options.size ?? 9.5)
    const indent = (options.indent ?? 0) + (options.list ? 5 : 0)
    const lines = doc.splitTextToSize(text, textWidth - indent)
    lines.forEach((line: string, index: number) => {
      ensureSpace(5.4)
      doc.text(toPdfText(line), margin + indent, y)
      if (index === 0 && options.list) doc.text('•', margin + indent - 4, y)
      y += 4.6
    })
  }

  // Cover block
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text(toPdfText('Shailja’s Fitness - Your Personalised Yoga Plan'), margin, y)
  y += 8
  if (userName.trim()) {
    body(`Prepared for ${userName.trim()}`, { bold: true, size: 10.5 })
  }
  body(`Goals: ${plan.selectedGoals.map(goalId => GOAL_LABELS[goalId]).join(', ')}`)
  body(`Prototype total: ${formatInr(price.totalAmountPaise)} - demo payment, no real money is collected.`, { size: 8.5 })
  plan.notices.forEach(notice => {
    body(`${notice.title}: ${notice.message}`, { size: 8.5, list: true })
  })
  body(plan.defaultsNote, { size: 8.5 })
  y += 4

  // 7 days
  for (const dayPlan of plan.days) {
    heading(
      dayPlan.recoveryDay
        ? `Day ${dayPlan.day} | ${dayPlan.focus} | Recovery`
        : `Day ${dayPlan.day} | ${dayPlan.focus} | ~ ${dayPlan.totalMinutes} min`,
      11.5,
      2,
    )
    if (!dayPlan.activities.length) {
      body('A rest day. Let your body absorb the week.', { indent: 4 })
    }
    for (const entry of dayPlan.activities) {
      const activity = entry.activity
      ensureSpace(20)
      const thumbnail = await loadImageThumbnail(poseImageFor(activity).src)
      if (thumbnail) {
        const imageWidth = 22
        const imageHeight = imageWidth * (thumbnail.height / thumbnail.width)
        doc.addImage(thumbnail.blob, 'JPEG', pageWidth - margin - imageWidth, y, imageWidth, imageHeight, undefined, 'FAST')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10.5)
        doc.splitTextToSize(toPdfText(activity.name), textWidth - 26).forEach((line: string) => {
          doc.text(line, margin, y)
          y += 4.8
        })
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc
          .splitTextToSize(toPdfText(`${activity.purpose} - ${activity.durationMinutes} min | Level: ${activity.level} | ${activity.equipment}`), textWidth - 26)
          .forEach((line: string) => {
            doc.text(line, margin, y)
            y += 4.2
          })
      } else {
        heading(activity.name, 10.5, 1)
        body(`${activity.purpose} - ${activity.durationMinutes} min | Level: ${activity.level} | ${activity.equipment}`)
      }
      body(`Chosen for: ${entry.reason.replace('Chosen for: ', '').replace(/\.$/, '')}`, { size: 8.5 })
      body('Steps:', { bold: true, size: 9 })
      activity.steps.forEach((step, index) => body(`${index + 1}. ${step}`, { indent: 4, size: 9 }))
      body(`Form & breathing: ${activity.breathCue}`, { indent: 4, size: 9 })
      body(`Easier modification: ${activity.modification}`, { indent: 4, size: 9 })
      if (activity.cautions.length) {
        body('Cautions:', { bold: true, size: 9 })
        activity.cautions.forEach(caution => body(`- ${caution}`, { indent: 4, size: 9 }))
      }
      y += 2.5
    }
  }

  // Food guidance
  doc.addPage()
  y = margin
  heading('Food do’s and don’ts', 13, 2)
  body('Flexible everyday guidance related to your goals. Nothing here prescribes calories or strict meal timings.')
  const foodGroups: Array<[string, FoodSelection[keyof FoodSelection]]> = [
    ['Everyday balanced eating', plan.food.foundation],
    ['Do', plan.food.doTips],
    ['Limit', plan.food.limitTips],
    ['Avoid', plan.food.avoidTips],
  ]
  for (const [label, tips] of foodGroups) {
    if (!tips.length) continue
    heading(label, 10.5, 1)
    for (const tip of tips) {
      body(toPdfText(tip.text), { list: true })
      if (tip.examples) body(`Examples: ${tip.examples}`, { indent: 4, size: 8.5 })
      if (tip.safetyNote) body(`Care: ${tip.safetyNote}`, { indent: 4, size: 8.5 })
    }
  }
  heading('Keep practising gently', 10.5, 1)
  body('Everyday wellness support — never diagnosis or treatment. Stop any movement that hurts, and consult a professional for medical questions.')
  doc.save(`shailjas-fitness-personalised-yoga-plan-${fileSafeName(userName)}.pdf`)
}

/* ------------------------------------------------------------------ */
/* Word (.docx)                                                        */
/* ------------------------------------------------------------------ */

export async function downloadPlanDocx(plan: WellnessPlan, userName: string): Promise<void> {
  const price = calculatePlanPrice(plan.selectedGoals)
  const paragraphs: Paragraph[] = []

  paragraphs.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    children: [new TextRun({ text: "Shailja's Fitness — Your Personalised Yoga Plan", bold: true })],
  }))
  if (userName.trim()) {
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: `Prepared for ${userName.trim()}`, bold: true })] }))
  }
  paragraphs.push(new Paragraph({ children: [new TextRun({ text: `Goals: ${plan.selectedGoals.map(goalId => GOAL_LABELS[goalId]).join(', ')}` })] }))
  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: `Prototype total: ${formatInr(price.totalAmountPaise)} — demo payment, no real money is collected.`,
      italics: true,
    })],
  }))
  for (const notice of plan.notices) {
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: `${notice.title}: ${notice.message}`, italics: true })] }))
  }
  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: 'Everyday wellness support — never diagnosis or treatment. Stop any movement that hurts, and consult a professional for medical questions.',
      italics: true,
    })],
    spacing: { after: 240 },
  }))

  for (const dayPlan of plan.days) {
    paragraphs.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({
        text: dayPlan.recoveryDay
          ? `Day ${dayPlan.day} · ${dayPlan.focus} · Recovery`
          : `Day ${dayPlan.day} · ${dayPlan.focus} · ≈ ${dayPlan.totalMinutes} min`,
      })],
    }))
    if (!dayPlan.activities.length) {
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: 'A rest day. Let your body absorb the week.' })] }))
    }
    for (const entry of dayPlan.activities) {
      const activity = entry.activity
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: activity.name, bold: true })],
      }))
      paragraphs.push(new Paragraph({ children: [new TextRun({
        text: `${activity.purpose} · ${activity.durationMinutes} min · Level: ${activity.level} · ${activity.equipment}`,
      })] }))
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: `Chosen for: ${entry.reason.replace('Chosen for: ', '').replace(/\.$/, '')}`, italics: true })] }))
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: 'Steps', bold: true })] }))
      activity.steps.forEach((step, index) => paragraphs.push(new Paragraph({
        numbering: { reference: 'plan-steps', level: 0 },
        children: [new TextRun({ text: step })],
      })))
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: `Form & breathing: ${activity.breathCue}` })] }))
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: `Easier modification: ${activity.modification}` })] }))
      if (activity.cautions.length) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: 'Cautions: ' + activity.cautions.join(' · ') })] }))
      }

      const thumbnail = await loadImageThumbnail(poseImageFor(activity).src)
      if (thumbnail) {
        const displayHeight = 70
        const displayWidth = Math.round(displayHeight * (thumbnail.width / thumbnail.height))
        paragraphs.push(new Paragraph({
          children: [new ImageRun({
            type: 'jpg',
            data: thumbnail.blob,
            transformation: { width: displayWidth, height: displayHeight },
          })],
          spacing: { after: 240 },
        }))
      }
    }
  }

  paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Food do’s and don’ts' })] }))
  const foodGroups: Array<[string, FoodSelection[keyof FoodSelection]]> = [
    ['Everyday balanced eating', plan.food.foundation],
    ['Do', plan.food.doTips],
    ['Limit', plan.food.limitTips],
    ['Avoid', plan.food.avoidTips],
  ]
  for (const [label, tips] of foodGroups) {
    if (!tips.length) continue
    paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: label, bold: true })] }))
    for (const tip of tips) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: tip.text })],
        bullet: { level: 0 },
      }))
      if (tip.examples) paragraphs.push(new Paragraph({ children: [new TextRun({ text: `Examples: ${tip.examples}`, italics: true })] }))
      if (tip.safetyNote) paragraphs.push(new Paragraph({ children: [new TextRun({ text: `Care: ${tip.safetyNote}`, italics: true })] }))
    }
  }

  const document = new Document({
    numbering: {
      config: [{
        reference: 'plan-steps',
        levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }],
      }],
    },
    sections: [{ children: paragraphs }],
  })
  const blob = await Packer.toBlob(document)
  triggerDownload(blob, `shailjas-fitness-personalised-yoga-plan-${fileSafeName(userName)}.docx`)
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
