import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * 结果页的源码文本，供文本断言型测试使用。
 *
 * 原来每个测试各自 readFileSync('../SingleResultPage.tsx')。那个文件被拆成
 * SingleResultPage.tsx + single/*.tsx 之后，断言的 markup 换了文件，测试就红了 ——
 * 但被测的东西一行没变。这里把它们合起来读，断言关心的是「结果页有没有这段实现」，
 * 不该关心它落在哪个文件。
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const componentsDir = path.join(here, '..')
const singleDir = path.join(componentsDir, 'single')

const parts = [readFileSync(path.join(componentsDir, 'SingleResultPage.tsx'), 'utf8')]
for (const name of readdirSync(singleDir).sort()) {
  if (name.endsWith('.tsx')) parts.push(readFileSync(path.join(singleDir, name), 'utf8'))
}

export const singleResultSource = parts.join('\n')
