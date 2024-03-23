import { load } from 'cheerio'
import { mung, type MungOptions } from '../src/mod.ts'
import { assertEquals } from 'std/assert/mod.ts'
import { join } from 'std/path/mod.ts'
import Transliterator from 'https://esm.sh/v135/lotin-kirill@0.1.3'

const fixturesDirPath = './tests/fixtures/'
const xliffFileName = 'example.xliff'

Deno.test(mung.name, async (t) => {
	await t.step('Simple examples', async (t) => {
		await t.step('Docs', () => {
			const fn = (s: string) => s.toUpperCase()
			const options = { each: 'a', from: 'b', to: 'c', fn }

			const before = `<xml>
    <a><b>text 1</b></a>
    <a><b>text 2</b></a>
</xml>`

			const after = `<xml>
    <a><b>text 1</b><c>TEXT 1</c></a>
    <a><b>text 2</b><c>TEXT 2</c></a>
</xml>`

			assertEquals(mung(before, options), after)
		})

		await t.step('Overwriting', () => {
			const xml = `<xml>
			<g>
				<from>Sender 1</from>
				<to/>
			</g>
			<g>
				<from>Sender 2</from>
				<to>Recipient 2</to>
			</g>
		</xml>`

			const out = mung(xml, {
				each: 'g',
				from: 'from',
				to: 'to',
				fn: (s) => s.toUpperCase(),
				overwrite: true,
			})

			assertEquals(
				out,
				`<xml>
			<g>
				<from>Sender 1</from>
				<to>SENDER 1</to>
			</g>
			<g>
				<from>Sender 2</from>
				<to>SENDER 2</to>
			</g>
		</xml>`,
			)
		})
	})

	await t.step(xliffFileName, async (t) => {
		const xliff = await Deno.readTextFile(join(fixturesDirPath, xliffFileName))

		const xliffTestDefaults = {
			each: 'trans-unit',
			from: 'source',
			to: 'target',
			fn: (s) => s.toUpperCase(),
		} satisfies Partial<MungOptions>

		await t.step('Content', async (t) => {
			const defaults = xliffTestDefaults

			await t.step('basic', () => {
				const out = mung(xliff, defaults)
				const $ = load(out, { xml: true })

				assertEquals($('trans-unit#basic > target').text(), 'BASIC')
			})

			await t.step('skips populated target (default)', () => {
				const out = mung(xliff, defaults)
				const $ = load(out, { xml: true })

				assertEquals($('trans-unit#populated-target > target').text(), '...')
			})

			await t.step('overwrites populated target (if configured)', () => {
				const out = mung(xliff, {
					...defaults,
					overwrite: true,
				})
				const $ = load(out, { xml: true })

				assertEquals($('trans-unit#populated-target > target').text(), 'POPULATED TARGET')
			})

			await t.step('skips start and end tags (but not contents)', () => {
				const out = mung(xliff, defaults)
				const $ = load(out, { xml: true })

				assertEquals($('trans-unit#contains-tag > target').html(), 'CONTAINS <g>TAG</g> + TRAILING')
			})

			await t.step('skips placeholder by regex', () => {
				const out = mung(xliff, {
					...defaults,
					skip: /\{[\w]+\}/gu,
				})
				const $ = load(out, { xml: true })

				assertEquals($('trans-unit#contains-placeholder > target').text(), 'CONTAINS {placeholder} + TRAILING')
			})

			await t.step('skips angle-bracket placeholder by unescaped regex', () => {
				const out = mung(xliff, {
					...defaults,
					skip: /<[\w]+>/gu,
				})
				const $ = load(out, { xml: true })

				const $el = $('trans-unit#contains-angle-placeholder > target')
				assertEquals($el.text(), 'CONTAINS <placeholder> + TRAILING')
				assertEquals($el.html(), 'CONTAINS &lt;placeholder&gt; + TRAILING')
			})

			await t.step('skips URL by regex', () => {
				const out = mung(xliff, {
					...defaults,
					skip: /https?:\/\/\S+/gu,
				})
				const $ = load(out, { xml: true })

				assertEquals($('trans-unit#contains-url > target').text(), 'CONTAINS https://example.com/url')
			})
		})

		await t.step('<alt-trans origin="mt">', async (t) => {
			const defaults = {
				...xliffTestDefaults,
				to: 'alt-trans[origin="mt"] > target',
			}

			await t.step('no-alt-trans', () => {
				const out = mung(xliff, defaults)
				const $ = load(out, { xml: true })

				const $el = $('trans-unit#no-alt-trans > alt-trans[origin="mt"] > target')
				assertEquals($el.length, 1)
				assertEquals($el.text(), 'NO ALT-TRANS')
			})

			await t.step('no-alt-trans (adds attributes)', () => {
				const out = mung(xliff, {
					...defaults,
					to: 'alt-trans[origin="mt"] > target.class[attr][name=val]',
				})
				const $ = load(out, { xml: true })

				const $el = $('trans-unit#no-alt-trans > alt-trans[origin="mt"] > target.class[attr][name=val]')
				assertEquals($el.length, 1)
				assertEquals($el.text(), 'NO ALT-TRANS')
			})

			await t.step('empty-alt-trans-mt', () => {
				const out = mung(xliff, defaults)
				const $ = load(out, { xml: true })

				const $el = $('trans-unit#empty-alt-trans-mt > alt-trans[origin="mt"] > target')
				assertEquals($el.length, 1)
				assertEquals($el.text(), 'EMPTY ALT-TRANS')
			})

			await t.step('empty-alt-trans-mt-target', () => {
				const out = mung(xliff, defaults)
				const $ = load(out, { xml: true })

				const $el = $('trans-unit#empty-alt-trans-mt-target > alt-trans[origin="mt"] > target')
				assertEquals($el.length, 1)
				assertEquals($el.text(), 'EMPTY ALT-TRANS TARGET')
			})

			await t.step('populated-alt-trans-mt skips populated target (default)', () => {
				const out = mung(xliff, defaults)
				const $ = load(out, { xml: true })

				const $el = $('trans-unit#populated-alt-trans-mt > alt-trans[origin="mt"] > target')
				assertEquals($el.length, 1)
				assertEquals($el.text(), '...')
			})

			await t.step('populated-alt-trans-mt overwrites populated target (if configured)', () => {
				const out = mung(xliff, {
					...defaults,
					to: 'alt-trans[origin="mt"] > target',
					overwrite: true,
				})
				const $ = load(out, { xml: true })

				const $el = $('trans-unit#populated-alt-trans-mt > alt-trans[origin="mt"] > target')
				assertEquals($el.length, 1)
				assertEquals($el.text(), 'POPULATED ALT-TRANS')
			})

			await t.step('alt-trans-other', () => {
				const out = mung(xliff, defaults)
				const $ = load(out, { xml: true })

				assertEquals($('trans-unit#alt-trans-other > alt-trans[origin="mt"]').length, 1)
				assertEquals($('trans-unit#alt-trans-other > alt-trans[origin="mt"]').text(), 'ALT-TRANS OTHER')

				assertEquals($('trans-unit#alt-trans-other > alt-trans[origin="other"]').length, 1)
				assertEquals($('trans-unit#alt-trans-other > alt-trans[origin="other"]').text(), '...')
			})

			await t.step('alt-trans-target-before-main-target', () => {
				const out = mung(xliff, defaults)
				const $ = load(out, { xml: true })

				const $el = $('trans-unit#alt-trans-target-before-main-target > alt-trans[origin="mt"] > target')
				assertEquals($el.length, 1)
				assertEquals($el.text(), 'ALT-TRANS TARGET BEFORE MAIN TARGET')

				assertEquals($('trans-unit#alt-trans-target-before-main-target > target').text(), '...')
			})
		})

		await t.step('Overwrite self', async (t) => {
			const defaults = xliffTestDefaults

			await t.step('basic', () => {
				const out = mung(xliff, {
					...defaults,
					to: 'source',
					overwrite: true,
				})

				const $ = load(out, { xml: true })

				assertEquals($('trans-unit#basic > target').text(), '')
				assertEquals($('trans-unit#basic > source').text(), 'BASIC')
			})
		})
	})
})
