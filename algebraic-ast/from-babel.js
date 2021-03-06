const given = f => f();
const fromEntries = require("@climb/from-entries");

const { is, array, data, string, number, type, or } = require("@algebraic/type");
const { nullable, tnull } = require("@algebraic/type");
const union = require("@algebraic/type/union-new");

const { parameterized } = require("@algebraic/type/parameterized");
const { parameters } = parameterized;
const fail = require("@algebraic/type/fail");

const Node = require("./node");

const Comment = require("./comment");
const Extra = require("./extra");
const { Position, SourceLocation } = require("./source-location");


const isNullOrUndefined =
    object => object === null || object === void(0);
const mapNullable = map => object =>
    isNullOrUndefined(object) ? null : map(object);
const mapSourceLocation = mapNullable(({ start, end }) =>
    SourceLocation({ start: Position(start), end: Position(end) }));
const mapComment = ({ type, loc, ...rest }) =>
    (type === "CommentBlock" ? Comment.Block : Comment.Line)
        ({ ...rest, loc: mapSourceLocation(loc) });
const mapArrayOf = map => array => array.map(map);
const mapComments = mapNullable(mapArrayOf(mapComment));
const toSourceData = node => Node.SourceData
({
    leadingComments: mapComments(node.leadingComments),
    innerComments: mapComments(node.innerComments),
    trailingComments: mapComments(node.trailingComments),
    start: node.start || null,
    end: node.end || null,
    loc: mapSourceLocation(node.loc)
});

const toKeyPath = path => !path || path.length <= 0 ?
    "" :
    `${path[1].length ? `${toKeyPath(path[1])}.` : ""}${path[0]}`;
const BabelTypeName = type => `[BabelNode ${type}]`;
const toExpectationString = expectation =>
    typeof expectation === "function" ?
        `type ${type.name(expectation)}` :
    expectation + "";

const failToMap = error => fail(error instanceof Error ?
    error :
    Object
        .assign(Object
        .defineProperty(Error(), "message",
        {
            get: () => (console.log(error),
                `Expected ${toExpectationString(error.expected)} at ` +
                `\`${toKeyPath(error.path)}\`, but found: ` +
                    (!error.value || typeof error.value !== "object" ?
                        error.value :
                    typeof error.value.type === "string" ?
                        BabelTypeName(error.value.type) :
                    JSON.stringify(error.value)))
        }),
        error));

const recover = f => ({ on(recover)
{
    try { return f() }
    catch(error) { return recover(error) }
} });

const FieldKeyMappings = fromEntries([
    [[
        "ArrowFunctionExpression",
        "FunctionExpression",
        "FunctionDeclaration"
    ], { parameters: "params", restParameter: "params" }],
    [[
        "ArrayPatternBinding",
        "ArrayAssignmentTarget"
    ], { restElement: "elements" }],
    [[
        "ObjectPatternBinding",
        "ObjectAssignmentTarget",
    ], { restProperty: "properties" }],
    [["ObjectProperty"], { prefersShorthand: "shorthand" }],
    [["PropertyBinding"],
    {
        prefersShorthand: "shorthand",
        binding: "value"
    }],
    [["PropertyAssignmentTarget"],
    {
        prefersShorthand: "shorthand",
        target: "value"
    }],
    [[
        "VariableDeclaration",
        "LetLexicalDeclaration",
        "ConstLexicalDeclaration"
    ], { bindings: "declarations" }]]
    .flatMap(([BabelTNs, mappings]) =>
        BabelTNs.map(BabelTN => [BabelTN, mappings])));

// Extra<T> is a special case because the *incoming* nodes might have this
// set to null... mainly because we don't bother to assign it to null.
const toMapExtra = ExtraT => given((
    ValueT = parameters(ExtraT)[0]) =>
    [
        [],
        (maps, path, value) =>
            value === undefined ? null : ExtraT(value)
    ]);

const toMapNodeFields = fields =>
    (maps, path, value) =>
    ({
        ...value,
        sourceData: toSourceData(value),
        ...fromEntries(fields
            .map(([toKey, fromKey, typename]) =>
            [
                toKey,
                maps[typename](
                    maps,
                    [fromKey, path],
                    value[fromKey])
            ]))
    });

const toMapNode = NodeT => given((
    typename = type.name(NodeT),
    fields = findMappableFields(NodeT),
    mapNodeFields = toMapNodeFields(fields)) =>
    [
        fields.map(([, , , T]) => T),
        Object.assign((maps, path, value) =>
            !value || value.type !== typename ?
                failToMap({ path, expected: NodeT, value }) :
                NodeT(mapNodeFields(maps, path, value)),
            { fields: mapNodeFields })
    ]);

const SAFENAME = x => { try { return type.name(x); } catch (e) { return x; } }

const NotFound = { };
const foundOr = (value, or) =>
    value !== NotFound ? value : or();
const toMapUnion = UnionT => given((
    Ts = union.components(UnionT),
    typenames = Ts.map(T => type.name(T)),
    count = Ts.length) =>
    [
        Ts,
        (maps, path, value) =>
            foundOr(typenames.reduce((mapped, typename, index) =>
                foundOr(mapped, () =>
                    recover(() => maps[typename](maps, path, value))
                        .on(error => error.path === path ?
                            (console.log(toKeyPath(path) + " failed for " + SAFENAME(error.expected), value),NotFound) :
                            (console.log(error),console.log(toKeyPath(path), "vs.", toKeyPath(error.path)), failToMap(error)))),
                    NotFound),
                () => failToMap({ expected: UnionT, path, value }))
    ]);

const isRestValue = item =>
    item &&
    item.type &&
    item.type.startsWith("Rest");
const toMapArray = ArrayT => given((
    ItemT = parameterized.parameters(ArrayT)[0],
    ItemTypename = type.name(ItemT)) =>
    [
        [ItemT],
        (maps, path, value) =>
            !Array.isArray(value) ?
                failToMap({ expected: ArrayT, path, value }) :
                (isRestValue(value[value.length - 1]) ?
                    value.slice(0, -1) :
                    value).map((item, index) =>
                        maps[ItemTypename](maps, [index, path], item))
    ]);

const toMapNullableRest = NullableT => given((
    RestT = parameters(NullableT)[0],
    RestTypename = type.name(RestT)) =>
    [
        [RestT],
        (maps, path, values) => given((
            index = values.length - 1,
            last = values[index]) =>
            isRestValue(last) ?
                maps[RestTypename](maps, [index, path], last) :
                null)
    ]);

const toMapPrimitive = T =>
[
    [],
    (maps, path, value) => is (T, value) ?
        value :
        failToMap({ path, expected: T, value })
];

const toMapType = T => (
    T === tnull || T === type.boolean ? toMapPrimitive :
    parameterized.is(array, T) ? toMapArray :
    parameterized.is(Node, T) ? toMapNode :
    parameterized.is(Extra, T) ? toMapExtra :
    isNullableRest(T) ? toMapNullableRest :
    type.kind(T) === union ? toMapUnion :
    (console.error("wasn't expecting " + T), T => []))(T);

const toMapEntries = (Ts, visited = Ts) =>
    Ts.size <= 0 ? [] : given((
    results = Array.from(Ts, T => [type.name(T), toMapType(T)]),
    discovered = new Set(results
        .flatMap(([, [Ts]]) => Ts)
        .filter(T => !visited.has(T)))) =>
        results
            .flatMap(([name, [, map]]) => Object
                .entries(map)
                .map(([key, map]) => [`${name}.${key}`, map])
                .concat([[name, map]]))
            .concat(toMapEntries(
                discovered,
                Array
                    .from(discovered)
                    .reduce((visited, T) =>
                        visited.add(T), visited))));

const findMappableFields = NodeT => given((
    NodeTN = type.name(NodeT),
    NodeFieldKeyMappings = FieldKeyMappings[NodeTN] || {}) => data
    .fields(NodeT)
    .filter(field =>
        is (data.field.definition.supplied, field.definition))
    .map(field => [field.name, parameters(field)[0]])
    .filter(([name, T]) =>
        NodeFieldKeyMappings[name] ||
        !name.endsWith("Comments") && isNodeOrComposite(T))
    .map(([name, T]) =>
    [
        name,
        NodeFieldKeyMappings[name] || name,
        type.name(T),
        T
    ]));

const isNullableRest = T =>
    parameterized.is(nullable, T) &&
    type.name(parameters(T)[0]).startsWith("Rest");

const isNodeOrComposite = T =>
    parameterized.is(array, T) ||
    parameterized.is(Node, T) ||
    parameterized.is(Extra, T) ||
    type.kind(T) === union &&
        union.components(T).some(isNodeOrComposite);

const toOrderedChoice = (precedent, map) =>
    (maps, path, value) =>
        recover(() =>
            precedent && precedent(maps, path, value))
            .on(error => error.path === path ?
                false :
                failToMap(error)) ||
        map(maps, path, value);

const toBabelMatchMap = given((
    BabelMatch = (type, entries) =>
    ({ toString: !entries ?
        () => `[BabelNode ${type}]` :
        () => `[BabelNode ${type}, where ${entries
            .map(([key, value]) => `${key} = ${value}`)
            .join(", ")}]`
    })) =>
    (NodeT, type, entries, mapFields) => type === "null" ?
        (maps, path, value) =>
            value === null ?
                NodeT() :
                failToMap({ expected: null, path, value }) :
        (maps, path, value) =>
            !value || value.type !== type ||
            entries && entries
                .some(([key, expected]) => value[key] !== expected) ?
            failToMap({ expected: BabelMatch(type, entries), path, value }) :
            NodeT(mapFields(maps, path, value)));

const toBabelMatchFrom = (precedent, AlgebraicTN) =>
    new Proxy({}, { get: (_, BabelTN) =>
        toBabelMatch(precedent, AlgebraicTN, BabelTN) });
const toBabelMatch = (precedent, AlgebraicTN, BabelTN) =>
    given((
        NodeT = Node[AlgebraicTN],
        MapFieldKey = `${AlgebraicTN}.fields`,
        toBabelMatchObject = (...rest) => given((
            babelMatchMap = toOrderedChoice(
                precedent,
                toBabelMatchMap(NodeT, BabelTN, ...rest))) =>
    ({
        from: toBabelMatchFrom(babelMatchMap, AlgebraicTN),
        [AlgebraicTN]: babelMatchMap
    }))) =>
    Object.assign((...args) =>
        toBabelMatchObject(
            typeof args[0] === "object" && Object.entries(args[0]),
            args.find(argument => typeof argument === "function") ||
            firstMaps[MapFieldKey]),
        toBabelMatchObject(false, firstMaps[MapFieldKey])));

const to = new Proxy(
    {},
    { get: (_, AlgebraicTN) =>
        ({ from: toBabelMatchFrom(false, AlgebraicTN) }) });

const firstMaps = fromEntries(
    toMapEntries(new Set(Object
        .values(Node)
        .filter(isNodeOrComposite))));

const maps = Object.assign({},
    firstMaps,

    to.Module.from.Program({ sourceType: "module" }),
    to.Script.from.Program({ sourceType: "script" }),

    to.IdentifierName.from.Identifier,
    to.IdentifierReference.from.Identifier,

    to.RestElementBinding.from.RestElement,

    to.IdentifierBinding
        .from.Identifier
        .from.VariableDeclarator(
            { init: null },
            (maps, path, value) => value.id),

    to.Elision.from.null,

    to.ArrayAssignmentTarget.from.ArrayPattern,
    to.RestElementAssignmentTarget.from.RestElement,

    to.ObjectAssignmentTarget.from.ObjectPattern,
    to.RestPropertyAssignmentTarget.from.RestElement,

    to.PropertyBinding.from.ObjectProperty,
    to.PropertyAssignmentTarget.from.ObjectProperty,

    to.DefaultedAssignmentTarget
        .from.AssignmentPattern((maps, path, value) =>
        ({
            target: maps.AssignmentTarget(maps, ["left", path], value.left),
            fallback: maps.Expression(maps, ["right", path], value.right)
        })),

    to.ArrayPatternBinding.from.ArrayPattern,
    to.ObjectPatternBinding.from.ObjectPattern,
    to.RestPropertyBinding.from.RestElement,

    // Would be nice to have a "push down" operator, X => value: X
    given((ValueTN = type.name(
        or(
            Node.IdentifierName,
            Node.StringLiteral,
            Node.NumericLiteral))) =>
        ["Identifier", "StringLiteral", "NumericLiteral"]
            .reduce((to, BabelTN) => to
                .from[BabelTN]((maps, path, value) =>
                    ({ value: maps[ValueTN](maps, path, value) })),
                to.LiteralPropertyName)),

    to.DefaultedBinding
        .from.VariableDeclarator((maps, path, value) =>
        ({
            binding: maps.IdentifierBinding(maps, ["id", path], value.id),
            fallback: maps.Expression(maps, ["init", path], value.init)
        }))
        .from.AssignmentPattern((maps, path, value) =>
        ({
            binding: maps.IdentifierBinding(maps, ["left", path], value.left),
            fallback: maps.Expression(maps, ["right", path], value.right)
        })),

    /*...[
        [Node.VariableDeclaration,
            "var", or (Node.IdentifierBinding, Node.DefaultedBinding)],
        [Node.LetLexicalDeclaration,
            "let", or (Node.IdentifierBinding, Node.DefaultedBinding)],
        [Node.ConstLexicalDeclaration,
            "const", Node.DefaultedBinding],
    ].map(([NodeT, kind, BindingT]) => given((
        ArrayBindingTN = type.name(array(BindingT))) =>
            to[type.name(NodeT)]
            .from.VariableDeclaration({ kind }, (maps, path, value) =>
            ({
                bindings: maps[ArrayBindingTN](
                    maps,
                    ["declarations", path],
                    value.declarations)
            }))))*/
);

module.exports = (T, value) => maps[type.name(T)](maps, [], value);

/*
const given = Object.assign(
    f => f(),
    {
        defer: (f, initialized = false) =>
        (...args) =>
            (initialized || (initialized = f()))(...args)
    });
*/

/*
const OrderedChoice = (expected, choices) =>
    (maps, path, value) =>
        choices.reduce((mapped, choice, index) =>
            mapped ||
            recover(() => choice(maps, path, value))
                .on(error => error.path === path ?
                    false :
                    failToMap(error)),
            false) ||
            failToMap({ expected, path, value });
*/
