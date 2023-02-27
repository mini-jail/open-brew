// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

const Error = Symbol("Error");
const Queue = new Set();
let nodeQueue;
let parentNode;
function scoped(callback) {
    const _node = node();
    parentNode = _node;
    try {
        return batch(()=>{
            let _cleanup = undefined;
            if (callback.length) {
                _cleanup = cleanNode.bind(undefined, _node, true);
            }
            return callback(_cleanup);
        });
    } catch (error) {
        handleError(error);
    } finally{
        parentNode = _node.parentNode;
    }
}
function node(initialValue, callback) {
    const _node = {
        value: initialValue,
        parentNode,
        children: undefined,
        context: undefined,
        cleanups: undefined,
        callback,
        sources: undefined,
        sourceSlots: undefined
    };
    if (parentNode) {
        if (parentNode.children === undefined) {
            parentNode.children = [
                _node
            ];
        } else {
            parentNode.children.push(_node);
        }
    }
    return _node;
}
function effect(callback, initialValue) {
    if (parentNode) {
        const _node = node(initialValue, callback);
        if (nodeQueue) nodeQueue.add(_node);
        else queueMicrotask(()=>updateNode(_node, false));
    } else {
        queueMicrotask(()=>callback(initialValue));
    }
}
function lookup(node, id) {
    return node ? node.context && id in node.context ? node.context[id] : lookup(node.parentNode, id) : undefined;
}
function handleError(error) {
    const errorCallbacks = lookup(parentNode, Error);
    if (!errorCallbacks) return reportError(error);
    for (const callback of errorCallbacks){
        callback(error);
    }
}
function batch(callback) {
    if (nodeQueue) return callback();
    nodeQueue = Queue;
    const result = callback();
    queueMicrotask(flush);
    return result;
}
function flush() {
    if (nodeQueue === undefined) return;
    for (const node of nodeQueue){
        nodeQueue.delete(node);
        updateNode(node, false);
    }
    nodeQueue = undefined;
}
function updateNode(node, complete) {
    cleanNode(node, complete);
    if (node.callback === undefined) return;
    const previousNode = parentNode;
    parentNode = node;
    try {
        node.value = node.callback(node.value);
    } catch (error) {
        handleError(error);
    } finally{
        parentNode = previousNode;
    }
}
function cleanNodeSources(node) {
    let source, sourceSlot, sourceNode, nodeSlot;
    while(node.sources.length){
        source = node.sources.pop();
        sourceSlot = node.sourceSlots.pop();
        if (source.nodes?.length) {
            sourceNode = source.nodes.pop();
            nodeSlot = source.nodeSlots.pop();
            if (sourceSlot < source.nodes.length) {
                source.nodes[sourceSlot] = sourceNode;
                source.nodeSlots[sourceSlot] = nodeSlot;
                sourceNode.sourceSlots[nodeSlot] = sourceSlot;
            }
        }
    }
}
function cleanChildNodes(node, complete) {
    const hasCallback = node.callback !== undefined;
    let childNode;
    while(node.children.length){
        childNode = node.children.pop();
        cleanNode(childNode, complete || hasCallback && childNode.callback !== undefined);
    }
}
function cleanNode(node, complete) {
    if (node.sources?.length) cleanNodeSources(node);
    if (node.children?.length) cleanChildNodes(node, complete);
    if (node.cleanups?.length) cleanup(node);
    node.context = undefined;
    if (complete) disposeNode(node);
}
function cleanup(node) {
    while(node.cleanups?.length){
        node.cleanups.pop()();
    }
}
function disposeNode(node) {
    node.value = undefined;
    node.parentNode = undefined;
    node.children = undefined;
    node.cleanups = undefined;
    node.callback = undefined;
    node.sources = undefined;
    node.sourceSlots = undefined;
}
let parentFgt;
let parentElt;
function addElement(tagName, callback) {
    if (parentElt || parentFgt) {
        const elt = document.createElement(tagName);
        if (callback) modify(elt, callback);
        insert(elt);
    }
}
function render(rootElt, callback) {
    return scoped((cleanup)=>{
        modify(rootElt, callback);
        return cleanup;
    });
}
function union(elt, curr, next) {
    const currentLength = curr.length;
    const nextLength = next.length;
    let currentNode, i, j;
    outerLoop: for(i = 0; i < nextLength; i++){
        currentNode = curr[i];
        for(j = 0; j < currentLength; j++){
            if (curr[j] === undefined) continue;
            else if (curr[j].nodeType === 3 && next[i].nodeType === 3) {
                if (curr[j].data !== next[i].data) curr[j].data = next[i].data;
                next[i] = curr[j];
            } else if (curr[j].isEqualNode(next[i])) next[i] = curr[j];
            if (next[i] === curr[j]) {
                curr[j] = undefined;
                if (i === j) continue outerLoop;
                break;
            }
        }
        elt.insertBefore(next[i], currentNode?.nextSibling || null);
    }
    while(curr.length)curr.pop()?.remove();
}
function qualifiedName(name) {
    return name.replace(/([A-Z])/g, (match)=>"-" + match[0]).toLowerCase();
}
function eventName(name) {
    return name.startsWith("on:") ? name.slice(3) : name.slice(2).toLowerCase();
}
function objectAttribute(elt, field, curr, next) {
    const fields = fieldsFrom(curr, next);
    if (fields.length === 0) return;
    for (const subField of fields){
        if (next && typeof next[subField] === "function") {
            effect((subCurr)=>{
                const subNext = next[subField]();
                if (subNext !== subCurr) elt[field][subField] = subNext;
                return subNext;
            });
        } else if (curr && curr[subField] && next[subField] === undefined) {
            elt[field][subField] = null;
        } else if ((curr && curr[subField]) !== next[subField]) {
            elt[field][subField] = next[subField] || null;
        }
    }
}
function dynamicAttribute(elt, field, accessor) {
    effect((curr)=>{
        const next = accessor();
        if (next !== curr) attribute(elt, field, curr, next);
        return next;
    });
}
function attribute(elt, field, curr, next) {
    if (typeof next === "function" && !field.startsWith("on")) {
        dynamicAttribute(elt, field, next);
    } else if (typeof next === "object") {
        objectAttribute(elt, field, curr, next);
    } else if (field === "textContent") {
        if (elt.firstChild?.nodeType === 3) elt.firstChild.data = next;
        else elt.prepend(String(next));
    } else if (field in elt) {
        if (curr && next === undefined) elt[field] = null;
        else elt[field] = next;
    } else if (field.startsWith("on")) {
        curr && elt.removeEventListener(eventName(field), curr);
        next && elt.addEventListener(eventName(field), next);
    } else if (next !== undefined) {
        elt.setAttributeNS(null, qualifiedName(field), String(next));
    } else {
        elt.removeAttributeNS(null, qualifiedName(field));
    }
}
function insert(node) {
    if (parentFgt) parentFgt.push(node);
    else parentElt?.appendChild(node);
}
function fieldsFrom(...objects) {
    const fields = [];
    for (const object of objects){
        if (object == null) continue;
        for(const field in object){
            if (fields.includes(field) === false) {
                fields.push(field);
            }
        }
    }
    return fields;
}
function attributes(elt, curr, next) {
    const fields = fieldsFrom(curr, next);
    if (fields.length === 0) return;
    for (const field of fields){
        const cValue = curr ? curr[field] : undefined;
        const nValue = next ? next[field] : undefined;
        if (cValue !== nValue) attribute(elt, field, cValue, nValue);
    }
}
function children(elt, curr, next) {
    if (curr?.length) union(elt, curr, next);
    else if (next.length) elt.append(...next);
}
function modify(elt, callback) {
    effect((curr)=>{
        const next = [
            callback.length ? {} : undefined,
            []
        ];
        parentElt = elt;
        parentFgt = next[1];
        callback(next[0]);
        if (curr || next[0]) attributes(elt, curr ? curr[0] : undefined, next[0]);
        if (curr || next[1].length) {
            children(elt, curr ? curr[1] : undefined, next[1]);
        }
        if (next[1].length === 0) next[1] = undefined;
        parentElt = undefined;
        parentFgt = undefined;
        return next;
    });
}
const App = ()=>{
    addElement("h1", (attr)=>{
        attr.textContent = "soon";
    });
};
render(document.body, ()=>{
    App();
});
