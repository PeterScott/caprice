// -*- coding: utf-8 -*-

// Causal tree weft manipulation library: server version. This is a
// stripped-down version of the non-server version, with CommonJS
// exports defined.

////////////////////////////////////////////////////////////
// Utility functions
////////////////////////////////////////////////////////////

// Increment a unicode character by a given incremement, which
// defaults to 1. May throw "ValueError" if the character
// overflows. This means you should switch to a new yarn.
function unicode_incr(character, increment) {
    var incr = increment || 1;
    return String.fromCharCode(character.charCodeAt(0) + incr);
}

// Split a string into a list of substrings of length chunk_len. If
// the length of the string is not evenly divisible by chunk_len, this
// will throw "IndexError".
function split_into_chunks(string, chunk_len) {
    if (string.length % chunk_len !== 0) throw "IndexError";
    var chunks = [];
    for (var i = 0; i < string.length; i += chunk_len) 
	chunks.push(string.substr(i, chunk_len));
    return chunks;
}

////////////////////////////////////////////////////////////
// Pulling: deriving an awareness weft from an atom.
////////////////////////////////////////////////////////////

// Convert a weave5c into deps4 form, which omits the character itself
// and only contains atoms that reference other yarns. It is used to
// simplify and speed up the pulling algorithm.
function make_deps4(weave5c) {
    var str = '';
    for (var i = 0; i < weave5c.length; i += 5)
	if (weave5c[i+1] !== weave5c[i+3])
	    str += weave5c.substring(i+1, i+5);
    return str;
}

// Return the awareness weft of an atom with a given id, including the
// id itself. If stringify is true (the default), then the dict weft
// will be converted into a weft2. If subweft is given (a weft in dict
// format; it can be derived from a weft2 with make_weft_dict), then
// it will be assumed to be a part of the awareness weft. This can be
// used for fast incremental calculation of awareness wefts. This may
// destructively modify subweft, so pass a copy if this is a problem.
// 
// For example, in a text editor, you can incrementally extend the
// awareness weft of the current atom being inserted. This lets you
// immediately calculate the awareness wefts of the heads of
// patches. The algorithm is still O(n^2), but it gets spread out into
// a bunch of minuscule increments, and the common case is fast.
// 
// If causing_id is given, then it will be added to the awareness
// weft. This is necessary if atom_id is not in weave5c, and therefore
// its parent can not be derived from inspection of weave5c. It may
// also speed up the calculation under some circumstances.
function pull(weave5c, atom_id, stringify, subweft, causing_id) {
    stringify = stringify || stringify === undefined;
    var weft = subweft || {};
    var extended = false;

    function extend_weft(new_id) {
	var yarn = new_id[0], offset = new_id[1];
	if (!under_weft(new_id, weft)) {
	    weft[yarn] = offset;
	    extended = true;
	}
    }

    // Common case: this atom sits right above the weft, and is caused
    // by something below the weft. In this case, just extend the weft
    // to cover the atom.
    var this_yarn = atom_id[0], this_offset = atom_id[1];
    if (causing_id && under_weft(causing_id, weft) 
	&& unicode_incr(weft[this_yarn] || '0') == this_offset)
	// Extend weft slightly
	extend_weft(atom_id);
    else {
	extend_weft(atom_id);	// initialize weft
	// Add causing_id if it was given
	if (causing_id) extend_weft(causing_id);
	// Build the deps4 string for easier processing
	var deps4 = make_deps4(weave5c);
	// Repeatedly traverse the weave. Any causing_ids we encounter will
        // be passed to extend_weft, and if that results in the weft being
        // extended, repeat the process.
	while (true) {
	    extended = false;
	    for (var i = 0; i < deps4.length; i += 4) {
		causing_id = deps4.substring(i, i+2);
		var this_id = deps4.substring(i+2, i+4);
		if (under_weft(this_id, weft))
		    extend_weft(causing_id);
	    }
	    if (!extended) break;
	}
    }
    return stringify ? weft_to_weft2(weft) : weft;
}

////////////////////////////////////////////////////////////
// Weft manipulation (conversion, canonicalization, etc.)
////////////////////////////////////////////////////////////

// Convert a weft2 to a dict-based weft.
function weft2_to_weft(weft2) {
    var weft = {};
    for (var i = 0; i < weft2.length; i += 2) {
	var yarn = weft2[i], offset = weft2[i+1];
	if (offset > (weft[yarn] || '0'))
	    weft[yarn] = offset;
    }
    return weft;
}

// Convert a dict-based weft to a weft2. May not return it in sorted
// order.
function weft_to_weft2(weft) {
    var chunks = [];
    for (var key in weft)
	if (key !== '0')
	    chunks.push(key + weft[key]);
    return chunks.join('');
}

// Return weft2 sorted by character. If there are duplicate chunks,
// their order is undefined.
function canonicalize_weft2(weft2) {
    var chunks = split_into_chunks(weft2, 2);
    chunks.sort()
    return chunks.join('')
}

// Convert a weft2 to a weftI. Any yarns not included in the weft2 are
// filled in with zero placeholders. The weftI produced is assumed to
// have an infinite number of trailing zeros.
function to_weftI(weft2) {
    var weft = weft2_to_weft(weft2);
    var num_keys = 0;
    // Sanitize weft by removing any keys that aren't unicode
    // characters greater than u'a'.
    for (var key in weft) {
	if (typeof key !== "string" || key < 'a') {
	    delete weft[key];
	} else {
	    num_keys++;
	}
    }
    // Build weftI, filling in any gaps
    var weftI = '', c = 'a';
    while (num_keys > 0) {
	if (weft[c] !== undefined) {
	    // Move this to the weftI
	    weftI += weft[c];
	    delete weft[c];
	    num_keys--;
	} else {
	    // Fill in the gap
	    weftI += '0';
	}
	c = unicode_incr(c);
    }
    return weftI;
}

// Is a > b, where a and b are both weftI strings? If a and b are of
// different lengths, the shorter of them will be padded with zeros.
function gt_weftI(a, b) {
    // Function for repeating a string
    function repeat(string, n) { 
	var ret = '';
	for (var i = 0; i < n; i++)
	    ret += string;
	return ret;
    }
    // Pad the shorter string with zeros
    if (a.length < b.length)
	a += repeat('0', b.length - a.length)
    if (b.length < a.length)
	b += repeat('0', a.length - b.length)
    return a > b
}

// Returns a regexp string matching two-char atom ids falling below
// the given weft2. Short for filtering regexp.
function filtre(weft2) {
    var tmp = weft2.replace(/([\s\S])([\s\S])/g, '$1[0-$2]|');
    return tmp.substring(0, tmp.length - 1);
}

// Is atom_id under weft2?
function under_weft2(atom_id, weft2) {
    var filtre_re = new RegExp(filtre(weft2));
    return atom_id.match(filtre_re) !== null;
}

// Is atom_id under a dict-based weft?
function under_weft(atom_id, weft) {
    var yarn = atom_id[0], offset = atom_id[1];
    var current_top = weft[yarn] || '0';
    return offset <= current_top;
}

// Return the rightmost weft2 of a given weave5c.
function rightmost_weft2(weave5c) {
    var weft = {};
    for (var i = 0; i < weave5c.length; i += 5) {
	var atom_id = weave5c.substring(i+3, i+5);
	if (!under_weft(atom_id, weft))
	    weft[atom_id[0]] = atom_id[1]; // extend weft
    }
    return weft_to_weft2(weft);
}

////////////////////////////////////////////////////////////
// Yarn manipulation utilities
////////////////////////////////////////////////////////////

// Return the id of the last atom in a given yarn, or null if no such
// atom is found.
function last_atom_id5c(weave5c, yarn) {
    // Look through every atom in the weave, and pick the last in the
    // given yarn.
    var last_atom = null;
    for (var i = 0; i < weave5c.length; i += 5) {
	var atom_id = weave5c.substring(i+3, i+5);
	if (atom_id[0] === yarn)
	    if (last_atom === null || atom_id[1] > last_atom[1])
		last_atom = atom_id;
    }
    return last_atom;
}

////////////////////////////////////////////////////////////
// Applying various types of patches to weaves.
////////////////////////////////////////////////////////////

// Apply an insertion patch to a weave. This involves a costly pulling
// operation, which can be eliminated if the patch itself comes with
// its causal awareness weft. If this is given as the optional weft2
// parameter, then the pulling operation will not be performed. This
// is potentially dangerous if the given weft2 is not complete;
// however, a client can always calculate the complete awareness weft
// of any of its inserted atoms.
function apply_insert_patch(weave5c, patch5c, weft2) {
    var causing_atom_id = patch5c.substring(1, 3);
    var my_weft = weft2 || pull(weave5c, patch5c.substring(3, 5), true, null, causing_atom_id);
    var my_weftI = null;	// Compute this lazily.
    // Locate the insertion point. First, we search for the causing
    // atom, then go past any delete or undeletes applied to
    // it. That's our insertion point.
    var insertion_point = 0;
    while (true) {
	insertion_point += 5;	// move right one atom
	if (insertion_point >= weave5c.length)
	    throw "BadPatchError";
	var prev_id = weave5c.substring(insertion_point-2, insertion_point);
	if (prev_id === causing_atom_id) {
	    // Skip ⌫ and ⌦.
	    while (true) {
		var right_neighbor_id = weave5c.substring(insertion_point+3, insertion_point+5);
		if (weave5c[insertion_point].match(/[⌫⌦]/)
		    && right_neighbor_id === causing_atom_id)
		    // Move right one atom
		    insertion_point += 5;
		else break;
	    }
	    // We've found it!
	    break;
	}
    }
    while (true) {
	// Check right neighbor to see if we're aware of it, or if it's ۝.
	if (under_weft2(right_neighbor_id, my_weft+'02'))
	    // Good news! We're aware of the right neighbor, and we
            // can just insert the patch5c here.
	    return weave5c.substring(0, insertion_point) + patch5c + weave5c.substring(insertion_point);
	else {
	    // Oh no, there's a causally unaware sibling! See if the
            // head atom's awareness weftI is greater than the sibling
            // to the right. If it is, then insert here. If not, then
            // go past the right sibling and try again.
	    my_weftI = my_weftI || to_weftI(my_weft);
	    var sibling_weft = pull(weave5c, right_neighbor_id);
	    var sibling_weftI = to_weftI(sibling_weft);
	    if (gt_weftI(my_weftI, sibling_weftI))
		// Insert patch here, and we're done.
		return weave5c.substring(0, insertion_point) + patch5c + weave5c.substring(insertion_point);
	    else {
		// Move the insertion point past this sibling, and try
                // again. We do this by stepping to the right until
                // the atom on the right is caused by an atom whose
                // parent is not the current sibling, but an atom that
                // the current sibling is aware of. (Lemma 2)
		while (true) {
		    insertion_point += 5; // move right one atom
		    var right_cause = weave5c.substring(insertion_point+1, insertion_point+3);
		    if (right_cause !== right_neighbor_id && under_weft2(right_cause, sibling_weft+'02'))
			break;
		}
		right_neighbor_id = weave5c.substring(insertion_point+3, insertion_point+5);
	    }
	}
    }
}

// Patch a weave5c with a delete patch. The patching process here is a
// little different than the process for insertion. Each deletion
// symbol is placed right after its causing atom. Does not require
// that the deletions be in any particular order.
function apply_delete_patch(weave5c, patch5c) {
    var str = '';
    // Build a dict mapping atom ids to their deletion atoms.
    var deletors = {};
    var num_deletors = 0;
    var chunks = split_into_chunks(patch5c, 5);
    for (var i in chunks) {
	var deletion_atom = chunks[i];
	deletors[deletion_atom.substring(1, 3)] = deletion_atom;
	num_deletors++;
    }
    // Go through the weave inserting deletion atoms
    for (var i = 0; i < weave5c.length; i += 5) {
	// Write this atom to the output
	str += weave5c.substring(i, i+5);
	// Tack on a deletor if we have one
	var this_atom_id = weave5c.substring(i+3, i+5);
	if (this_atom_id in deletors) {
	    str += deletors[this_atom_id];
	    delete deletors[this_atom_id];
	    num_deletors--;
	}
    }
    // We should have used up all the deletors.
    if (num_deletors > 0) 
	throw "BatPatchError";
    return str
}

// Patch a weave5c with a save-edits patch. Such a patch consists of
// one or more phi atoms, which are inserted after the End atom in the
// weave5c.
function apply_save_edits_patch(weave5c, patch5c) {
    return weave5c + patch5c;	// So easy!
}

////////////////////////////////////////////////////////////
// CommonJS export declarations
////////////////////////////////////////////////////////////

exports.apply_insert_patch = apply_insert_patch;
exports.apply_delete_patch = apply_delete_patch;
exports.apply_save_edits_patch = apply_save_edits_patch;