const { is, data, nullable, array, or } = require("@algebraic/type");
const { boolean, number, string } = require("@algebraic/type/primitive");
const union2 = require("@algebraic/type/union-new");
const Node = require("./node");
const { StringSet } = require("./string-set");
const compute = require("./compute");


exports.AssignmentExpression = Node `AssignmentExpression` (
    left                =>  Node.RootPattern,
    right               =>  Node.Expression,
    operator            =>  string,
    ([freeVariables])   =>  compute (StringSet,
                                take => `left.freeVariables`,
                                take => `right.freeVariables` ) );

exports.IdentifierExpression = Node `IdentifierExpression` (
    ({override:type})   =>  "Identifier",
    name                =>  string,
    ([freeVariables])   =>  compute (StringSet,
                                take => `name`) );

exports.ArrowFunctionExpression = Node `ArrowFunctionExpression` (
    body                =>  or (Node.BlockStatment, Node.Expression),
    ([id])              =>  data.always (null),
    params              =>  array(nullable(Node.RootPattern)),

    ([generator])       =>  data.always (false),
    async               =>  [boolean, false],

    ([freeVariables])   =>  compute (StringSet,
                                take => `body.freeVariables`,
                                take => `params.freeVariables`) );

exports.FunctionExpression = Node `FunctionExpression` (
    body                =>  Node.BlockStatement,
    id                  =>  nullable(Node.IdentifierPattern),
    params              =>  array (nullable(Node.RootPattern)),

    generator           =>  [boolean, false],
    async               =>  [boolean, false],

    ([freeVariables])   =>  compute (StringSet,
                                take => `body.freeVariables`,
                                take => `params.freeVariables`,
                                subtract => `id.bindingNames`,
                                subtract => StringSet(["arguments"]) ) );

exports.ArrayExpression = Node `ArrayExpression` (
    elements            =>  array(Node.Expression),
    ([freeVariables])   =>  compute (StringSet,
                                take => `elements.freeVariables`) );

exports.CallExpression = Node `CallExpression` (
    callee              =>  Expression,
    arguments           =>  array(Expression),
    ([freeVariables])   =>  compute (StringSet,
                                take => `callee.freeVariables`,
                                take => `arguments.freeVariables` ) );

exports.ConditionalExpression = Node `ConditionalExpression` (
    test                =>  Node.Expression,
    consequent          =>  Node.Expression,
    alternate           =>  Node.Expression,
    ([freeVariables])   =>  compute (StringSet,
                                take => `test.freeVariables` ,
                                take => `consequent.freeVariables`,
                                take => `alternate.freeVariables` ) );

exports.BinaryExpression = Node `BinaryExpression` (
    left                =>  Node.Expression,
    right               =>  Node.Expression,
    operator            =>  string,
    ([freeVariables])   =>  compute (StringSet,
                                take => `left.freeVariables`,
                                take => `right.freeVariables` )  );

exports.LogicalExpression = Node `LogicalExpression` (
    left                =>  Node.Expression,
    right               =>  Node.Expression,
    operator            =>  string,
    ([freeVariables])   =>  compute (StringSet,
                                take => `left.freeVariables`,
                                take => `right.freeVariables` ) );

exports.StaticMemberExpression = Node `StaticMemberExpression` (
    ({override:type})   =>  "MemberExpression",
    ([computed])        =>  data.always (false),

    object              =>  Node.Expression,
    property            =>  Node.PropertyName,
    optional            =>  [nullable(boolean), null],
    ([freeVariables])   =>  compute (StringSet,
                                take => `object.freeVariables`) );

exports.ComputedMemberExpression = Node `ComputedMemberExpression` (
    ({override:type})   =>  "MemberExpression",
    ([computed])        =>  data.always (true),

    object              =>  Node.Expression,
    property            =>  Node.Expression,
    optional            =>  [nullable(boolean), null],
    ([freeVariables])   =>  compute (StringSet,
                                take => `object.freeVariables`,
                                take => `property.freeVariables` ) );

exports.NewExpression = Node `NewExpression` (
    callee              =>  Node.Expression,
    arguments           =>  array(Node.Expression),
    ([freeVariables])   =>  compute (StringSet,
                                take => `callee.freeVariables`,
                                take => `arguments.freeVariables` ) );

exports.ThisExpression = Node `ThisExpression` (
    ([freeVariables])   =>  compute.empty (StringSet) );

exports.SequenceExpression = Node `SequenceExpression` (
    expressions         =>  array(Node.Expression),
    ([freeVariables])   =>  compute (StringSet,
                                take => `expressions.freeVariables`) );

exports.TaggedTemplateExpression = Node `TaggedTemplateExpression` (
    tag                 =>  Node.Expression,
    quasi               =>  Node.TemplateLiteral,
    ([freeVariables])   =>  compute (StringSet,
                                take => `tag.freeVariables`,
                                take => `quasi.freeVariables`) );

exports.UnaryExpression = Node `UnaryExpression` (
    argument            =>  Node.Expression,
    operator            =>  string,
    prefix              =>  [boolean, true],
    ([freeVariables])   =>  compute (StringSet,
                                take => `argument.freeVariables`) );

exports.UpdateExpression = Node `UpdateExpression` (
    argument            =>  Node.Expression,
    operator            =>  string,
    prefix              =>  [boolean, true],
    ([freeVariables])   =>  compute (StringSet,
                                take => `argument.freeVariables`) );

exports.YieldExpression = Node `YieldExpression` (
    argument            =>  Node.Expression,
    delegate            =>  [boolean, false],
    ([freeVariables])   =>  compute (StringSet,
                                take => `argument.freeVariables`));

exports.AwaitExpression = Node `AwaitExpression` (
    argument            =>  Node.Expression,
    ([freeVariables])   =>  compute (StringSet,
                                take => `argument.freeVariables`) );

exports.ObjectPropertyShorthand = data `ObjectPropertyShorthand` (
    ({override:type})   =>  "ObjectProperty",

    ([shorthand])       =>  data.always (true),
    ([computed])        =>  data.always (false),

    ([key])             =>  [Node.PropertyName, value => Node.PropertyName(value)],
    value               =>  Node.IdentifierExpression,

    ([freeVariables])   =>  compute (StringSet,
                                take => `value.freeVariables`) )

exports.ObjectPropertyLonghand = data `ObjectPropertyLonghand` (
    ({override:type})   =>  "ObjectProperty",

    ([shorthand])       =>  data.always (false),
    ([computed])        =>  [boolean, key =>
                                is(Node.ComputedPropertyName, key)],

    key                 =>  or (Node.ComputedPropertyName,
                                Node.PropertyName,
                                Node.StringLiteral),
    value               =>  Node.Expression,
    ([freeVariables])   =>  compute (StringSet,
                                take => `key.freeVariables`,
                                take => `value.freeVariables` ) );

exports.ObjectProperty = union2 `ObjectProperty` (
    is                  => Node.ObjectPropertyLonghand,
    or                  => Node.ObjectPropertyShorthand );

exports.ObjectExpression = data `ObjectExpression` (
    properties          => array (Node.ObjectProperty),
    ([freeVariables])   => compute (StringSet,
                                take => `properties.freeVariables`) );

Object.assign(exports, require("./literals"));
    
    
    
    
    
