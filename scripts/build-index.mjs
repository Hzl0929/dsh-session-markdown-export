#!/usr/bin/env node
/**
 * Build the self-hosted plugin market index (format 1) for this plugin.
 *
 * Run after `npm publish` so `publishTimestamp` matches the registry; when the
 * package is not on npm yet the current time is used instead, so the file is
 * always valid JSON that DSH accepts.
 *
 * @module dsh-session-markdown-export/scripts/build-index
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const repo = 'https://github.com/Hzl0929/dsh-session-markdown-export'

/**
 * Read one version's real publish time from npm, in Unix seconds.
 *
 * @param name - package name.
 * @param version - exact version.
 * @returns the publish time, or the current time when npm has no answer.
 */
function publishTimestamp(name, version) {
  try {
    const raw = execFileSync('npm', ['view', `${name}@${version}`, 'time', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const parsed = JSON.parse(raw)
    const time = typeof parsed === 'string' ? parsed : (parsed?.[version] ?? parsed?.time)
    const ms = typeof time === 'string' ? Date.parse(time) : Number.NaN
    if (Number.isFinite(ms)) return Math.floor(ms / 1000)
  } catch {
    /* not published yet */
  }
  return Math.floor(Date.now() / 1000)
}

const index = {
  format: 1,
  title: { en: 'Hzl0929 DSH plugins', zh: 'Hzl0929 的 DSH 插件' },
  plugins: [
    {
      name: pkg.name,
      title: { en: 'Session Markdown Export', zh: '会话 Markdown 导出' },
      description: {
        en: 'Export one DSH session as a single foldable Markdown document from the sidebar session menu.',
        zh: '在侧栏会话菜单把一个会话导出为可折叠的 Markdown 文档。',
      },
      icon: `icons/${pkg.name}.svg`,
      author: 'Hzl0929',
      homepage: pkg.homepage,
      repository: { url: repo },
      versions: [
        {
          version: pkg.version,
          publishTimestamp: publishTimestamp(pkg.name, pkg.version),
          source: { type: 'npm' },
          engines: { dsh: pkg.engines?.dsh ?? '>=0.2.1' },
        },
      ],
    },
  ],
}

mkdirSync(join(root, 'market', 'icons'), { recursive: true })
copyFileSync(join(root, 'icon.svg'), join(root, 'market', 'icons', `${pkg.name}.svg`))
writeFileSync(join(root, 'market', 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
console.log(`market/index.json -> ${pkg.name}@${pkg.version}`)
