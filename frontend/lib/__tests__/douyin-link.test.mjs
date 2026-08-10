import assert from 'node:assert/strict'
import test from 'node:test'

import { extractDouyinVideoLink } from '../douyinLink.mjs'

test('extracts a short Douyin video link from share text', () => {
  assert.equal(
    extractDouyinVideoLink('复制这段文字 https://v.douyin.com/Dn8_yKgnK2Q/ 打开抖音观看'),
    'https://v.douyin.com/Dn8_yKgnK2Q/',
  )
})

test('accepts canonical and share video URLs', () => {
  assert.equal(extractDouyinVideoLink('https://www.douyin.com/video/7536899712345678901'), 'https://www.douyin.com/video/7536899712345678901')
  assert.equal(extractDouyinVideoLink('https://www.iesdouyin.com/share/video/7536899712345678901/'), 'https://www.iesdouyin.com/share/video/7536899712345678901/')
})

test('rejects Douyin pages that do not identify a video', () => {
  assert.equal(extractDouyinVideoLink('https://www.douyin.com/?recommend=1'), '')
  assert.equal(extractDouyinVideoLink('https://www.douyin.com/search/减脂'), '')
  assert.equal(extractDouyinVideoLink('https://example.com/video/7536899712345678901'), '')
})
