// deno-lint-ignore-file no-fallthrough
import type { Cheerio, Element } from 'cheerio'
import { load } from 'cheerio'
import { escape, unescape } from 'std/html/entities.ts'
import { createParser, render } from 'css-selector-parser'
import { assert } from 'std/assert/assert.ts'
import { unimplemented } from 'std/assert/unimplemented.ts'
import { unreachable } from 'std/assert/unreachable.ts'

const parseSelector = createParser()

export interface MungOptions {
	/** Apply this function to the content before writing it */
	fn: (x: string) => string
	/** Run for each matching element of selector */
	each: string
	/** Get the content of this selector */
	from: string
	/** Write the content to this selector */
	to: string
	/**
	 * Overwrite existing content if `to` selector is populated
	 * @default false
	 */
	overwrite?: boolean
	/**
	 * Skip content matching this regular expression or matcher (write matched content as-is)
	 */
	skip?: Pick<RegExp, typeof Symbol.matchAll>
}

function skipBy(input: string, skip: Pick<RegExp, typeof Symbol.matchAll>) {
	const out: string[] = []

	let idx = 0
	for (const m of skip[Symbol.matchAll](input)) {
		out.push(input.slice(idx, m.index))
		out.push(m[0])
		idx = m.index! + m[0].length
	}

	out.push(input.slice(idx))

	return out
}

/**
 * Mung XML text content into some other form by means of a transform function.
 *
 * @param xml - XML content to mung
 * @param options - Options describing how to mung the XML content
 * @returns The munged XML
 *
 * @example
 *
 * ```ts
 * import { mung } from './mung.ts'
 * import { assertEquals } from 'std/assert/mod.ts'
 *
 * const fn = (s: string) => s.toUpperCase()
 * const options = { each: 'a', from: 'b', to: 'c', fn }
 *
 * const before = `<xml>
 * 	<a><b>text 1</b></a>
 * 	<a><b>text 2</b></a>
 * </xml>`
 *
 * const after = `<xml>
 * 	<a><b>text 1</b><c>TEXT 1</c></a>
 * 	<a><b>text 2</b><c>TEXT 2</c></a>
 * </xml>`
 *
 * assertEquals(mung(before, options), after)
 * ```
 */
export function mung(xml: string, options: MungOptions) {
	const { fn, each, from, to, overwrite, skip } = options

	const $ = load(xml, { xml: true })

	const rootToken = parseSelector(to)
	assert(rootToken.rules.length === 1)

	for (const el of $(each)) {
		const $el = $(el) as Cheerio<Element>
		const $from = $el.find(`:scope > ${from}`).eq(0)
		let $to = $el.find(`:scope > ${to}`).eq(0)

		if (!$to.length) {
			let $cur = $el

			let rule = structuredClone(rootToken.rules[0])

			while (true) {
				assert(rule.items.length)
				assert(rule.combinator == null || rule.combinator === '>')
				assert(rule.items[0].type === 'TagName')

				const subSelector = `:scope ${render({ ...rule, combinator: '>', nestedRule: undefined })}`
				$to = $cur.find(subSelector)

				if ($to.length) {
					if (rule.nestedRule) {
						rule = rule.nestedRule
						$cur = $to
					} else {
						break
					}
				} else {
					const tag = rule.items[0].name
					const attrs: Record<string, string> = {}
					for (const item of rule.items.slice(1)) {
						switch (item.type) {
							case 'ClassName': {
								attrs.class = item.name
								break
							}
							case 'Attribute': {
								if (!item.value) {
									attrs[item.name] = ''
									break
								}
								assert(item.value.type === 'String')
								attrs[item.name] = item.value.value
								break
							}
							// `Id` unsupported as IDs must be unique
							case 'Id':
							// some kinds of `PseudoClass`, e.g. `:not`, might possibly be supported in future
							case 'PseudoClass':
							// `TagName` can only be first item
							case 'TagName':
							// `WildcardTag` and `PseudoElement` unclear what they would mean in this context
							case 'WildcardTag':
							case 'PseudoElement': {
								unimplemented(`Unsupported selector item type: ${item.type}`)
							}
							default: {
								unreachable()
							}
						}
					}

					$to = $(`<${tag}>` as 'xml-element')
					for (const [k, v] of Object.entries(attrs)) {
						$to.attr(k, v)
					}
					$cur.append($to)

					if (rule.nestedRule) {
						rule = rule.nestedRule
						$cur = $to
					} else {
						break
					}
				}
			}
		}

		if (!overwrite && $to.html()) {
			continue
		}

		$to.html(
			($from.html() ?? '')
				.split(/(<[^>]+>)/)
				.flatMap((x, i) => {
					if (i % 2) {
						// is start/end tag
						return x
					}

					const unescaped = unescape(x)
					const segs = skip ? skipBy(unescaped, skip) : [unescaped]

					return segs.map((x, i) => escape(i % 2 ? x : fn(x)))
				})
				.join(''),
		)
	}

	const x = $.xml()

	// we unescape then re-escape entities to ensure nothing is escaped unnecessarily
	return x.replaceAll(/&#?\w+;/gu, (m) => escape(unescape(m)))
}
