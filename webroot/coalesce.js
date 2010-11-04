////////////////////////////////////////
//        Coalescing patches          //
////////////////////////////////////////

coalesce = {
    // Go through a patch list looking for places where the user typed a
    // single character, hit backspace, and replaced it with the correct
    // character. Replace these with simple insertion of the correct
    // character. This is a cheap transformation (linear time and space),
    // and should be performed before any other passes in patch
    // coalescence.
    coalesce_1char_typos: function(patches) {
	if (patches.length < 3)
	    return patches;
	var new_list = []

	for (var i = 0; i < patches.length; i++) {
	    // Look for this pattern of patches, and transform:
	    // ('i', p, _), ('d', p, 1), ('i', p, x) => ('i', p, x)
	    if (i <= patches.length - 3 
		&& patches[i][0] === 'i' && patches[i+1][0] === 'd' && patches[i+2][0] === 'i'
		&& patches[i][1] === patches[i+1][1] && patches[i][1] === patches[i+2][1]
		&& patches[i+1][2] === 1) {
		// Found the pattern! Now throw away patches i and i+1.
		new_list.push(patches[i+2]);
		i += 2;		// Skip two patches
	    } else
		new_list.push(patches[i]);
	}

	return new_list;
    },

    // Coalesce spans of inserts and deletes. This does not give an
    // optimal solution, but should pretty much deal with strings of
    // typing, strings of backspaces, and strings of deletes (forward,
    // with the delete key). It operates in linear time.
    coalesce_insdel: function(patches) {
	if (patches.length < 2)
	    return patches;
	var new_list = [];
	var i = 0, j = 0;

	while (i < patches.length) {
	    if (patches[i][0] === 'i') {
		// Start an insert span.
		var buffer = patches[i][2];
		for (j = i+1; j < patches.length && patches[j][0] === 'i' 
		     && patches[j-1][1] + patches[j-1][2].length === patches[j][1];
		     j++)
		    buffer += patches[j][2];
		new_list.push(['i', patches[i][1], buffer]);
		i = j;
	    } else if (patches[i][0] === 'd' && i < patches.length - 1) {
		if (patches[i+1][0] === 'd' && patches[i+1][1] === patches[i][1] - 1) {
		    // Start of a chain of backspaces.
		    var sum_len = patches[i][2];
		    for (j = i+1; j < patches.length && patches[j][0] === 'd'
			 && patches[j][1] === (patches[j-1][1] - 1); j++)
			sum_len += patches[j][2];
		    new_list.push(['d', patches[j-1][1], sum_len]);
		    i = j;
		} else if (patches[i+1][0] === 'd' && patches[i+1][1] === patches[i][1]) {
		    // Start a chain of forward-deletes.
		    var sum_len = patches[i][2];
		    for (j = i+1; j < patches.length && patches[j][0] === 'd'
			 && patches[j][1] === patches[j-1][1]; j++)
			sum_len += patches[j][2];
		    new_list.push(['d', patches[j-1][1], sum_len]);
		    i = j;
		} else {
		    new_list.push(patches[i]);
		    i++;
		}
	    } else {
		new_list.push(patches[i]);
		i++;
	    }
	}

	return new_list;
    },

    // Coalesce patches by combining both coalescence passes.
    coalesce_patches: function(patches) {
	return coalesce_insdel(coalesce_1char_typos(patches));
    }
}