import { Parser, ParserTuple } from './Parser.ts';
import { ParserError, ParserState } from './ParserState.ts';
import { tuple } from './index.ts';
import { succeed } from './ParserCreators.ts';


/** Runs a sequence of parsers in order.
 * Will return an error if the minimum amount of parsers didn't succeed.
 * @param parsers The parsers to run. Preferrably, use the tuple function instead of the array syntax to get the correct intellisense.
 * @param min The minimum amount of parsers to succeed. Put -1 for all of them, but it is also the default value. */
export const sequenceOf = <T extends any[]>(parsers: ParserTuple<T>, min = -1) =>
	new Parser<T>(inputState => {
		if (inputState.error) return inputState;
		const results = [] as unknown as T;

		let nextState = inputState;
		let finalError: ParserError | undefined = undefined;
		let psucceed = 0;
		let lastIndex = 0;
		for (const parser of parsers) {
			nextState = parser.transformer(nextState);
			if (nextState.error) {
				// Catch errors
				psucceed--;
				finalError = nextState.error;
			} else lastIndex = nextState.index;
			results.push(nextState.result);
			psucceed++;
		}

		if (finalError && (psucceed < min || min === -1))
			return nextState.errorify({
				...finalError,
				combinator: 'sequenceOf',
				nparser: psucceed
			});
		else return nextState.update(lastIndex, results);
	});

/** Runs the first parser that is successful.
 * @param parsers The parsers to run. */
export const choice = <T extends any[]>(...parsers: ParserTuple<T>) =>
	new Parser<T[number]>(inputState => {
		if (inputState.error) return inputState;

		for (const parser of parsers) {
			const nextState = parser.transformer(inputState);
			if (!nextState.error) return nextState;
		}

		return inputState.errorify({
			info: `Unable to match with any parser`,
			combinator: 'choice',
			index: inputState.index
		});
	});

/** Runs the parser as many times as possible.
 * @param parser The parsers to run.
 * @param min The minimum amount of times to run the parser for it to be successful. */
export const many = <T>(parser: Parser<T>, min = 0) =>
	new Parser<T[]>(inputState => {
		if (inputState.error) return inputState;
		const results: T[] = [];

		let nextState = inputState;
		let done = false;
		while (!done) {
			nextState = parser.transformer(nextState);
			if (nextState.error) done = true;
			else results.push(nextState.result);
		}

		if (results.length < min) {
			return inputState.errorify({
				info: `Unable to match at least ${min} input(s), matched ${results.length} instead`,
				combinator: 'many',
				index: inputState.index,
				nmatches: results.length
			});
		}

		return nextState.resultify(results);
	});

/** Generates a parser creator that will parse the content between 2 parsers.
 * @param left The left parser.
 * @param right The right parser. */
export const between =
<TL, TR>(left: Parser<TL>, right: Parser<TR>) =>
	<T>(content: Parser<T>) =>
		sequenceOf(tuple(left, content, right))
		.map(results => results[1]) as Parser<T>;





/** Runs a sequence of parsers interconnected by a same parser.
 * @param parsers The parsers to run.
 * @param joiner The parser interconnecting the other parsers together.
 * @param min The minimum amount of parsers to be successful (joiners excluded). Enter -1 for all of them, although it is already the default value.
 * @param joinResults Whether to include the results of the joiner parsers in the final array of results or not, false by default. */
const __join = <T extends any[], TP>(
	parsers: ParserTuple<T>, joiner: Parser<TP>,
	min = -1, joinResults: boolean
) => {
	const joinedParsers: ParserTuple<(T[number]|TP)[]> = [];
	let starts = true;

	for (let parser of parsers) {
		if (starts) starts = false;
		else if (joinResults === true as true) {
			joinedParsers.push(joiner);
		} else {
			parser = sequenceOf(tuple(joiner, parser))
			.map((result) => result[1]);
		}
		joinedParsers.push(parser);
	}

	return sequenceOf(joinedParsers, min)
		.mapError(from => ({ ...from.error as ParserError, combinator: 'join' }));
};

/** Runs a sequence of parsers interconnected by a same parser.
 * Doesn't include the results of the joiner parsers.
 * @param parsers The parsers to run.
 * @param joiner The parser interconnecting the other parsers together.
 * @param min The minimum amount of parsers to be successful (joiners excluded). Enter -1 for all of them, although it is already the default value. */
export const join = <T extends any[], TP>(
	parsers: ParserTuple<T>, joiner: Parser<TP>,
	min = -1
) => __join(parsers, joiner, min, false) as Parser<T>

/** Runs a sequence of parsers interconnected by a same parser.
 * Includes the results of the joiner parsers.
 * @param parsers The parsers to run.
 * @param joiner The parser interconnecting the other parsers together.
 * @param min The minimum amount of parsers to be successful (joiners excluded). Enter -1 for all of them, although it is already the default value. */
export const joinWJR = <T extends any[], TP>(
	parsers: ParserTuple<T>, joiner: Parser<TP>,
	min = -1
) => __join(parsers, joiner, min, true)

/** Runs a parser as many times as possible, interconnected by a same other parser.
 * @param parser The parser to run.
 * @param joiner The parser interconnecting the other parser together.
 * @param min The minimum amount of parsers to be successful (joiners excluded). Enter -1 for all of them, although it is already the default value.
 * @param joinResults Whether to include the results of the joiner parsers in the final array of results or not, false by default. */
const __manyJoin = <T, TP>(
	parser: Parser<T>, joiner: Parser<TP>,
	min = 0, joinResults = false
) => {
	return new Parser<(T|TP)[]>(inputState => {
		if (inputState.error) return inputState;
		const results: (T|TP)[] = [];

		let nextState = inputState;
		let done = false;
		let starts = true;
		let np = 0;
		while (!done) {
			if (starts) starts = false;
			else {
				nextState = joiner.transformer(nextState);
				if (nextState.error) done = true;
				else if (joinResults) results.push(nextState.result);
			}
			nextState = parser.transformer(nextState);
			if (nextState.error) done = true;
			else {
				results.push(nextState.result);
				np++;
			}
		}

		if (np < min) {
			return inputState.errorify({
				info: `Unable to match at least ${min} input(s), matched ${results.length} instead`,
				combinator: 'manyJoin',
				index: inputState.index,
				nmatches: results.length
			});
		}

		return nextState.resultify(results);
	});
};

/** Runs a parser as many times as possible, interconnected by a same other parser.
 * Doesn't include the results of the joiner parsers.
 * @param parser The parser to run.
 * @param joiner The parser interconnecting the other parser together.
 * @param min The minimum amount of parsers to be successful (joiners excluded). Enter -1 for all of them, although it is already the default value. */
export const manyJoin = <T, TP>(
	parser: Parser<T>, joiner: Parser<TP>, min = 0
) => __manyJoin(parser, joiner, min, false) as Parser<T[]>

/** Runs a parser as many times as possible, interconnected by a same other parser.
 * Includes the results of the joiner parsers.
 * @param parser The parser to run.
 * @param joiner The parser interconnecting the other parser together.
 * @param min The minimum amount of parsers to be successful (joiners excluded). Enter -1 for all of them, although it is already the default value. */
export const manyJoinWJR = <T, TP>(
	parser: Parser<T>, joiner: Parser<TP>, min = 0
) => __manyJoin(parser, joiner, min, true)





/** Lets you make a flattened version of the chain method using yields. */
export const contextual =
<T, TResult>(generator: () => Generator<Parser<T>, TResult, T>): Parser<TResult> => {
	return Parser.void.chain(() => {
		const iterator = generator()

		const runStep = (next?: T): Parser<TResult> => {
			const iteration = iterator.next(...[next] as [] | [T])

			if (iteration.done)
				return succeed(iteration.value)
			
			const nextParser = iteration.value
			if (!(nextParser instanceof Parser))
				throw new Error('contextual: yielded values must always be parsers')
			
			return nextParser.chain(runStep)
				.mapError(state => ({ ...state.error as ParserError, combinator: 'contextual' }))
		}

		return runStep()
	})
}

/** Same as contextual, but you get ParserStates from yielded Parsers instead. */
export const stateContextual =
<T, TResult>(generator: () => Generator<Parser<T>, ParserState<TResult>, ParserState<T>>): Parser<TResult> => {
	return new Parser(inputState => {
		const iterator = generator()

		const transformStep = (next: ParserState<T>): ParserState<TResult> => {
			const iteration = iterator.next(next)

			if (iteration.done)
				return iteration.value
			
			const nextParser = iteration.value as Parser<T>
			if (!(nextParser instanceof Parser))
				throw new Error('stateContextual: yielded values must always be parsers')
			
			return transformStep(nextParser.transformer(next))
		}

		return transformStep(inputState)
	})
}