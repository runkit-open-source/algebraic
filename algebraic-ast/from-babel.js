const fromEntries = require("@climb/from-entries");

const Comment = require("./comment");
const { Position, SourceLocation } = require("./source-location");
const { is } = require("@algebraic/type");
const fail = require("@algebraic/type/fail");

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
const mapMetadataNodeFields = node => Node.Metadata
({
    leadingComments: mapComments(node.leadingComments),
    innerComments: mapComments(node.innerComments),
    trailingComments: mapComments(node.trailingComments),
    start: node.start || null,
    end: node.end || null,
    loc: mapSourceLocation(node.loc)
});

const Node = require("./node");

const toMapNode = function (mappings)
{
    const t = require("@babel/types");

    t.VISITOR_KEYS["Program"].push("interpreter");

    // DEPRECATED_KEYS is an unfortunate named map that actually contains
    // DEPRECATED_TYPES.
    const undeprecated = t.TYPES
        .filter(name => t[name] && !t.DEPRECATED_KEYS[name]);
    const mapVisitorFields = (fields, node) =>
        fromEntries(fields.map(field =>
            [field, mapNullableNode(node[field])]));
    const toMapNodeFields = (name, fields) => node =>
    ({  ...node,
        ...mapVisitorFields(fields, node),
        metadata: mapMetadataNodeFields(node) });
    const nodeFieldMaps = fromEntries(
        undeprecated.map(name =>
            [name, toMapNodeFields(name, t.VISITOR_KEYS[name])]));
    const mapNode = node =>
        !node ? node :
        Array.isArray(node) ? node.map(mapNode) :
        is (Node, node) ? node :
        ((name, fields) =>
            (mappings[name] ?
                mappings[name](fields, node) :
                Node[name](fields)))
            (node.type, nodeFieldMaps[node.type](node));
    const mapNullableNode = mapNullable(mapNode);

    return mapNode;
}

const mapNode = (function ()
{
    const { is, data, string, number, getTypename } = require("@algebraic/type");
    const { parameterized: { parameters } } = require("@algebraic/type/parameterized");

    const toObjectPropertyKey = ({ computed, key }) =>
        computed ? Node.ComputedPropertyName({ expression: key }) :
        is (Node.IdentifierExpression, key) ? Node.PropertyName(key) :
        key;
    const toObjectPropertyPattern = ({ shorthand, value, ...rest }) =>
        !shorthand ?
            Node.ObjectPropertyPatternLonghand({ ...rest,
                key: toObjectPropertyKey(rest),
                value: toPattern(value) }) :
            Node.ObjectPropertyPatternShorthand({ ...rest,
                value: is (Node.AssignmentPattern, value) ?
                    Node.ShorthandAssignmentPattern(value) :
                    toPattern(value) });
    const toPattern = pattern =>
//        is(Node.Identifier, pattern) ||
        is(Node.IdentifierExpression, pattern) ?
            Node.IdentifierPattern(pattern) :
        is(Node.ObjectProperty, pattern) ?
            toObjectPropertyPattern(pattern) :
            pattern;

    const mapToPatterns = (key, fields) => (patterns =>
    ({
        ...fields,
        [key]: fields[key].map(toPattern)
    }))();
    const toPatternFields = (keys, type) => mappedFields =>
        type({ ...mappedFields, ...fromEntries(keys
            .map(key => [key, mappedFields[key]])
            .map(([key, value]) => [key,
                Array.isArray(value) ?
                    value.map(toPattern) : toPattern(value)])) });

    return toMapNode(
    {
        Program: ({ sourceType, ...mappedFields }) =>
            sourceType === "module" ?
                Node.Module(mappedFields) :
                Node.Script(mappedFields),

        MemberExpression: (mappedFields, { computed, property }) =>
            Node.MemberExpression(computed ?
                mappedFields : { ...mappedFields, property }),

        CatchClause: toPatternFields(["param"], Node.CatchClause),

        VariableDeclarator: toPatternFields(["id"], Node.VariableDeclarator),

        ArrowFunctionExpression: toPatternFields(["params"],
            Node.ArrowFunctionExpression),

        FunctionExpression: toPatternFields(["id", "params"],
            Node.FunctionExpression),

        FunctionDeclaration: toPatternFields(["id", "params"],
            Node.FunctionDeclaration),

        Identifier: Node.IdentifierExpression,

        AssignmentPattern: ({ left, ...mappedFields }) =>
            Node.AssignmentPattern({ left: toPattern(left), ...mappedFields }),

        ArrayPattern: mappedFields =>
            Node.ArrayPattern(mapToPatterns("elements", mappedFields)),

        LabeledStatement: ({ label, ...mappedFields }) =>
            Node.LabeledStatement({ ...mappedFields, label: Node.Label(label) }),

        // ObjectPropertyPatterns are tricky. We can discover them here in the
        // actual property conversion phase since if they own a pattern, they
        // definitely can't resolve to an ObjectProperty.
        ObjectProperty: mappedFields =>
            is(Node.RootPattern, mappedFields.value) ||
            is(Node.AssignmentPattern, mappedFields.value) ?
                toObjectPropertyPattern(mappedFields) :
            (({ computed, shorthand, ...rest }) =>
                shorthand ? Node.ObjectPropertyShorthand(mappedFields) :
                Node.ObjectPropertyLonghand({ ...mappedFields,
                    key: toObjectPropertyKey(mappedFields) }))
            (mappedFields),

        MemberExpression: ({ computed, property, ...mappedFields }) =>
            computed ?
                Node.ComputedMemberExpression({ ...mappedFields, property }) :
                Node.StaticMemberExpression(
                    { ...mappedFields, property: Node.PropertyName(property) }),

        // Or we could discover them later on here, if the ObjectPattern looked
        // syntactically equivalent to an ObjectExpression thus far (e.g. {x}).
        // At this point we will be sure that this is an ObjectPattern, and thus
        // it's children must be ObjectPropertyPatterns.
        ObjectPattern: mappedFields =>
            Node.ObjectPattern(mapToPatterns("properties", mappedFields)),

        RestElement: ({ argument, ...mappedFields }) =>
            Node.RestElement({ ...mappedFields, argument: toPattern(argument) }),

        TemplateElement: ({ value, ...mappedFields }) =>
            Node.TemplateElement({ ...mappedFields,
                value: Node.TemplateElement.Value(value) }),

        VariableDeclaration: ({ kind, declarations: declarators, ...mappedFields }) =>
            kind === "var" ?
                Node.VarVariableDeclaration({ ...mappedFields, declarators }) :
                Node.BlockVariableDeclaration({ ...mappedFields, kind, declarators }),

        ...fromEntries([
            Node.BigIntLiteral,
            Node.NumericLiteral,
            Node.RegExpLiteral,
            Node.StringLiteral,
            Node.DirectiveLiteral]
                .map(type => [type, parameters(parameters(
                    data.fields(type)
                        .find(field => field.name === "extra"))[0])[0]])
                .map(([type, ExtraT]) => [getTypename(type),
                    ({ extra, ...mappedFields }) => type(
                    {
                        ...mappedFields,
                        extra: extra ? ExtraT(extra) : null
                    })])),

        Placeholder: ({ name, expectedNode }) =>
            expectedNode !== "Expression" ?
                fail(`Only PlaceholderExpressions are supported.`) :
                Node.PlaceholderExpression({ name: name.name })
    });
})();


module.exports = function map(node)
{
    return mapNode(node);
}

