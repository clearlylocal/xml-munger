import { load } from 'cheerio'
import { mung, type MungOptions } from '../src/mod.ts'
import { assertEquals } from '@std/assert'
import { join } from '@std/path'
import Transliterator from 'https://esm.sh/v135/lotin-kirill@0.1.3'

const fixturesDirPath = './tests/fixtures/'

function deleteAllTargetTextContents(xml: string) {
	const $ = load(xml, { xml: true })
	$('trans-unit > target').text('')

	return $.xml()
}

Deno.test('lotin kirill', async () => {
	const kirill = await Deno.readTextFile(join(fixturesDirPath, 'lotin-kirill.xliff'))
	const lotin = deleteAllTargetTextContents(kirill)

	const transliterator = new Transliterator(
		JSON.parse(await Deno.readTextFile(join(fixturesDirPath, 'all-exceptionals.json'))),
	)
	const fn = (x: string) => transliterator.textToCyrillic(x)
	const skip = /[{<][^{}<>]+[}>]|%(?:\d+\$)?[a-z]|\\(?:x\p{AHex}{2}|u\p{AHex}{4}|u\{\p{AHex}{1,6}\}|.)/giu

	const options = { each: 'trans-unit', from: 'source', to: 'target', fn, skip }

	assertEquals(mung(lotin, options), kirill)
})
