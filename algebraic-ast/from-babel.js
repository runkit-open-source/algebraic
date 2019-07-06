const Comment = require("./comment");
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
const mapCommonNodeFields = node =>
({
    leadingComments: mapComments(node.leadingComments),
    innerComments: mapComments(node.innerComments),
    trailingComments: mapComments(node.trailingComments),
    start: node.start,
    end: node.end,
    loc: mapSourceLocation(node.loc)
});

const Node = require("./node");
const toMapNode = function (mappings)
{
    const { VISITOR_KEYS } = require("@babel/types");
    const undeprecated = require("./babel/undeprecated-types");
    const mapVisitorFields = (fields, node) => Object
        .fromEntries(fields.map(field =>
            [field, mapNullableNode(node[field])]));
    const toMapNodeFields = (name, fields) => node =>
        ({  ...node,
            ...mapVisitorFields(fields, node),
            ...mapCommonNodeFields(node) });
    const nodeFieldMaps = Object.fromEntries(
        undeprecated.map(name =>
            [name, toMapNodeFields(name, VISITOR_KEYS[name])]));
    const mapNode = node => Array.isArray(node) ?
        node.map(mapNode) :
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
    const { is, string } = require("@algebraic/type");
    const { Set } = require("@algebraic/collections");
    const toBindings = name => Set(string)([name]);
    const toIdentifierPattern = identifier =>
        Node.IdentifierPattern({ ...identifier,
            bindings: toBindings(identifier.name) });
    const toObjectPropertyPattern = ({ value, ...rest }) =>
        (value =>  Node.ObjectPropertyPattern
            ({ ...rest, value, bindings: value.bindings }))
        (toPattern(value));
    const toPattern = pattern =>
        is(Node.Identifier, pattern) ||
        is(Node.IdentifierExpression, pattern) ?
            toIdentifierPattern(pattern) :
        is(Node.ObjectProperty, pattern) ?
            toObjectPropertyPattern(pattern) :
            pattern;
//    const toPatternAndBindings = (key, fields) =>
//        (pattern => ({ [key]: pattern, bindings: pattern.bindings }))
//        (toPattern(fields[key]))

    const mapToPatterns = (key, fields) => (patterns =>
    ({
        ...fields,
        [key]: patterns,
        bindings: patterns.reduce((lhs, rhs) =>
            lhs.concat(rhs.bindings), Set(string)())
    }))(fields[key].map(toPattern));
    const Assignment = (type, inheritBindings) =>
        ({ left, ...mappedFields }) =>
            (left => type({ ...mappedFields, left,
                ...(inheritBindings && { bindings: left.bindings }) }))
        (toPattern(left));

    return toMapNode(
    {
        AssignmentExpression: Assignment(Node.AssignmentExpression, false),

        MemberExpression: (mappedFields, { computed, property }) =>
            Node.MemberExpression(computed ?
                mappedFields : { ...mappedFields, property }),

        Identifier: Node.IdentifierExpression,

        AssignmentPattern: Assignment(Node.AssignmentPattern, true),

        ArrayPattern: mappedFields =>
            Node.ArrayPattern(mapToPatterns("elements", mappedFields)),

        // ObjectPropertyPatterns are tricky. We can discover them here in the
        // actual property conversion phase since if they own a pattern, they
        // definitely can't resolve to an ObjectProperty.
        ObjectProperty: mappedFields => is(Node.Pattern, mappedFields.value) ?
            toObjectPropertyPattern(mappedFields) :
            Node.ObjectProperty(mappedFields),

        // Or we could discover them later on here, if the ObjectPattern looked
        // syntactically equivalent to an ObjectExpression thus far (e.g. {x}).
        // At this point we will be sure that this is an ObjectPattern, and thus
        // it's children must be ObjectPropertyPatterns.
        ObjectPattern: mappedFields =>
            Node.ObjectPattern(mapToPatterns("properties", mappedFields)),

        RestElement: mappedFields =>
            (argument => Node.RestElement
                ({ ...mappedFields, argument, bindings: argument.bindings }))
            (toPattern(mappedFields.argument))
    });
})();


module.exports = function map(node)
{
    return mapNode(node);
}

/*

const Node = require("./node");
const { NODE_FIELDS } = require("@babel/types");
const undeprecated = require("./babel/undeprecated-types");


const trivialMappings = Object
    .key(undeprecated)
    .map(name => [name, ]


function trivial(name)
{
    const fields = NODE_FIELDS[name];
    const type = Node[name];

    return function (babelNode)
    {
        const entries = fields
            .map(field => [field, fromBabel(babelNode[field])]);

        return type({ ...babelNode, });
        babelNode
        NODE_FIELDS
        t[name]
    }
}

const fromJS = (type, object) =>
    type((fields => Object.fromEntries(Object
        .keys(object)
        .map(key => [key, fields[key]])
        .map(([key, type]) => !type || is(primitive, type) ?
            object[key] : fromJS(type, object[key]))))
        (Object.fromEntries(data.fields(type))));

    
    
    .map()



function mapCommonFields(node) =>
({
    leadingComments: (node || []).map(comment => Comment)
})
{
    return {
        

        leadingComments => [nullable(Array), null],
        innerComments   => [nullable(Array), null],
        trailingComment => [nullable(Array), null],
        start           => [nullable(number), null],
        end             => [nullable(number), null],
        loc             => [nullable(SourceLocation), null]
}

module.exports = function fromBabel(node)
{
    return node;
}


/*
const fromJS = (type, object) =>
    type((fields => Object.fromEntries(Object
        .keys(object)
        .map(key => [key, fields[key]])
        .map(([key, type]) => [key,
            !type || typeof object[key] !== "object" ?
                object[key] : fromJS(type, object[key])])))
    (Object.fromEntries(data.fields(type))));
*/