const { declare, getTypename, parameterized } = require("@algebraic/type");
const { List, OrderedMap, Map, Set, OrderedSet, Stack, Seq } = require("immutable");

const inspect = Symbol.for("nodejs.util.inspect.custom");
const { hasOwnProperty } = Object;


exports.List = parameterized (T =>
    toImmutableBridge(List, List.isList, T));
exports.List.base = List;

exports.OrderedMap = parameterized ((K, V) =>
    toImmutableBridge(OrderedMap, OrderedMap.isOrderedMap, K, V));
exports.OrderedMap.base = OrderedMap;

exports.Map = parameterized ((K, V) =>
    toImmutableBridge(Map, Map.isMap, K, V));
exports.Map.base = Map;

exports.Set = parameterized (T =>
    toImmutableBridge(Set, Set.isSet, T));
exports.Set.base = Set;

exports.OrderedSet = parameterized (T =>
    toImmutableBridge(OrderedSet, OrderedSet.isOrderedSet, T));
exports.OrderedSet.base = OrderedSet;

exports.Stack = parameterized (T =>
    toImmutableBridge(Stack, Stack.isStack, T));
exports.Stack.base = Stack;

exports.Seq = parameterized (T =>
    toImmutableBridge(Seq, Seq.isSeq, T));
exports.Seq.base = Seq;


function toImmutableBridge(constructor, is, ...types)
{
    if (!is)
        throw TypeError(constructor.name + " must provide an is function.");

    // This has to be hasOwnProperty, if not we will incorrectly detect a
    // subclass' inspect.
    if (!hasOwnProperty.call(constructor, inspect))
        constructor.prototype[inspect] = constructor.prototype.toString;

    const basename = getTypename(constructor);
    const typename = `${basename}<${types.map(getTypename).join(", ")}>`;
    const create = constructor;
    const serialize = [types.length === 1 ?
        (value, serialize) =>
            value.toArray().map(value => serialize(types[0], value)) :
        (value, serialize) =>
            value.entrySeq().toArray().map(([key, value]) =>
                [serialize(types[0], key), serialize(types[1], value)]),
        false];
    const deserialize = types.length === 1 ?
        (serialized, deserialize) => type(serialized.map(serialized =>
            deserialize(types[0], serialized))) :
        (serialized, deserialize) => type(serialized.map(([key, value]) =>
            [deserialize(types[0], key), deserialize(types[1], value)]));
    const type = declare({ typename, create, is, serialize, deserialize });

    for (const key of Object.keys(constructor))
        type[key] = constructor[key];

    return type;
}
