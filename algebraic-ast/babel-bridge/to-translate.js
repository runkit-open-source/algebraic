const [{ isArray }, { fromEntries }] = [Array, Object];
const findMap = require("@climb/find-map");

const { is, parameterized, data, type, nullable } = require("@algebraic/type");
const union = require("@algebraic/type/union-new");
const fail = require("@algebraic/type/fail");
const { parameters } = parameterized;
const given = f => f();
const Node = require("../node");


const toPredicatedTranslate = (TargetT, fields, predicate) =>
    (translate, keyPath, value) =>
        predicate(translate, keyPath, value) &&
        TargetT(fromEntries(
            fields.map(([toKey, fromKey, compute, FieldTN, isOptional]) =>
            [
                toKey,
                /*isOptional && from.every(key => value[key] === void(0)) ?
                    null :
                    */translate(FieldTN, [keyPath, fromKey], compute(value))
            ])));

const toWrappingTranslate = (TargetT, specification) => given((
    entries = specification
        .entries
        .map(([key, EntryT]) => [key, type.name(EntryT)])) =>
        (translate, keyPath, value) =>
            TargetT(fromEntries(entries
                .map(([key, EntryTN]) =>
                    [key, translate(EntryTN, keyPath, value)]))));

const toSpecificationTranslate = (TargetT, specifications) => given((
    fields = data
        .fields(TargetT)
        .filter(field =>
            is (data.field.definition.supplied, field.definition))
        .map(field => [field.name, parameters(field)[0]])
        .map(([name, FieldT]) => [name, FieldT, type.name(FieldT)])) =>
[
    fields.map(([, FieldT]) => FieldT),
    toOrderedChoice(specifications
        .map(specification => 
            specification.entries ?
            toWrappingTranslate(TargetT, specification) :
            toPredicatedTranslate(
                TargetT,
                fields.map(([name, FieldT, FieldTN]) => given((
                    fieldSetting = specification.fieldSettings[name],
                    fieldCasting = specification.fieldCastings[name]) =>
                [
                    name,
                    !fieldSetting ?
                        name :
                    !fieldSetting.dependencies.length < 2 ?
                        fieldSetting.dependencies[0] :
                        `${fieldSetting.dependencies.join(",")}`,
                    fieldSetting ?
                        fieldSetting.compute :
                        ({ [name]: value }) => value,
                    fieldCasting ?
                        type.name(fieldCasting.TargetT) :
                        FieldTN,
                    //hmmmm... this may clash with what we do right above here...
                    is(nullable, FieldT)
                ])),
                toSpecificationPredicate(specification))),
        TargetT)
]);

const toSpecificationPredicate = ({ pattern, type: T }) =>
    given((
        predicates = Object.entries(pattern)) =>
        (translate, keyPath, value) =>
            !is (T, value) ?
                translate.fail(T, keyPath, value) :
            predicates
                .find(([name, expected]) =>
                    value[name] !== expected &&
                    translate.fail(expected, keyPath, value[name])) ?
            false :
            true);

const attempt = f =>
({ catch: recover =>
    (...args) =>
    {
        try { return f(...args) }
        catch (error) { return recover(error, ...args); }
    } });

// When is it a committed choice?
const toOrderedChoice = (candidates, ExpectedT) =>
    candidates.length <= 1 ?
        candidates[0] :
        given((recoverable = candidates
            .map(f =>
                attempt((...args) => [true, f(...args)])
                .catch((error, translate, keyPath) =>
                    error.keyPath !== keyPath ?
                        translate.fail(error) :
                        [false]))
            .concat((translate, ...rest) =>
                translate.fail(ExpectedT, ...rest))) =>
        (...args) => findMap(f => f(...args), recoverable)[1]);


const toDataTranslate = (specifications, TargetT) => given((
    TargetTN = type.name(TargetT)) =>
    toSpecificationTranslate(
        TargetT,
        specifications[TargetTN] ||
        [specifications.toDefaultTranslation(TargetTN)]));

const toPrimitiveTranslate = T => 
[
    [],
    T === type.null ?
        (translate, keyPath, value) =>
            value === null || value === void(0) ?
                null :
                translate.fail(T, keyPath, value) :
        (translate, keyPath, value) =>
            is (T, value) ? value : translate.fail(T, keyPath, value)
];

const toTranlsateUnion = UnionT => given((
    Ts = union.components(UnionT)) =>
[
    Ts,
    toOrderedChoice(Ts
        .map(T => type.name(T))
        .map(TN => (translate, ...rest) => translate(TN, ...rest)),
        UnionT)
]);

const toTranslate = (specifications, T) => (
    type.kind(T) === type.primitive ? toPrimitiveTranslate :
    type.kind(T) === type.array ? toArrayTranslate :
    type.kind(T) === data ? T => toDataTranslate(specifications, T) :
    type.kind(T) === union ? toTranlsateUnion :
    (console.error("wasn't expecting " + T), T => [[]]))(T);

const toKeyPath = path => !path || path.length <= 0 ?
    "" :
    `${path[0].length ? `${toKeyPath(path[0])}.` : ""}${path[1]}`;
const BabelTypeName = type => `[BabelNode ${type}]`;
const toExpectationString = expectation =>
    typeof expectation === "function" ?
        `type ${type.name(expectation)}` :
    expectation + "";

translateFail = (...args) => 
    fail(args.length === 1 ?
        args[0] :
        given((
            [expected, keyPath, value] = args) =>
        Object
            .assign(Object
            .defineProperty(Error(), "message",
            {
                get: () => (console.log(expected),
                    `Expected ${toExpectationString(expected)} at ` +
                    `\`${toKeyPath(keyPath)}\`, but found: ` +
                        (!value || typeof value !== "object" ?
                            value :
                        typeof value.type === "string" ?
                            BabelTypeName(value.type) :
                        JSON.stringify(value)))
            }),
            { expected, keyPath, value })));

const toTranslateEntries = (specifications, Ts, visited = Ts) =>
    Ts.size <= 0 ? [] : given((
    results = Array.from(Ts, T =>
        [type.name(T), toTranslate(specifications, T)]),
    discovered = new Set(results
        .flatMap(([, [Ts]]) => Ts)
        .filter(T => !visited.has(T)))) =>
            results
                .map(([name, [, translate]]) => [name, translate])
                .concat(toTranslateEntries(
                    specifications,
                    discovered,
                    Array
                        .from(discovered)
                        .reduce((visited, T) =>
                            visited.add(T), visited))));

const isRestValue = item =>
    item &&
    item.type &&
    item.type.startsWith("Rest");
const toArrayTranslate = ArrayT => given((
    ItemT = parameterized.parameters(ArrayT)[0],
    ItemTypename = type.name(ItemT)) =>
[
    [ItemT],
    (translate, keyPath, value) =>
        !Array.isArray(value) ?
            translate.fail(ArrayT, keyPath, value) :
            (isRestValue(value[value.length - 1]) ?
                value.slice(0, -1) :
                value).map((item, index) =>
                    translate(ItemTypename, [keyPath, index], item))
]);

module.exports = function (types, specifications)
{
    const translates = fromEntries(toTranslateEntries(specifications, types));
    const translate = (TN, keyPath, value) =>
        translates[TN](translate, keyPath, value);

    translate.fail = translateFail;

    return (TargetT, node) => translate(type.name(TargetT), [[], "root"], node);
}
