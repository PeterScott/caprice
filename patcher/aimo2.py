# -*- coding: utf-8 -*-
# Version two of the Aimo base code.

import re
try: from cStringIO import StringIO     # Use StringIO as a fallback
except ImportError: from StringIO import StringIO

############################################################
# Exceptions for error handling
############################################################

class Error(Exception):
    '''Base class for all exceptions caused by this module'''
    pass

class BadPatchError(Error):
    '''Exception raised when an invalid patch is encountered. Has
    attributes patch5c, weave5c, and msg, which contain the patch, the
    weave, and the error message, respectively.'''

    def __init__(self, msg, patch5c, weave5c):
        self.msg = msg
        self.patch5c = patch5c
        self.weave5c = weave5c

    def __str__(self):
        return '%s Patch: %r, in weave\n%r' \
            % (unicode(self.msg), self.patch5c, self.weave5c)

############################################################
# Utility functions
############################################################

def unicode_incr(char, increment=1):
    '''Increment a unicode character by a given incremement, which
    defaults to 1. May raise ValueError if the character
    overflows. This means you should switch to a new yarn.'''
    return unichr(increment + ord(char))

def split_into_chunks(string, chunk_len):
    '''Split a string into a list of substrings of length
    chunk_len. If the length of the string is not evenly divisible by
    chunk_len, this will raise IndexError.'''
    if len(string) % chunk_len != 0:
        raise IndexError
    regexp = u'(%s)' % ('.'*chunk_len)
    return re.findall(regexp, string, flags=re.DOTALL)

############################################################
# Simple transformation operations
############################################################

def stringify(text3):
    '''Convert text3 into a text1. Does not do anything about special
    characters, which you might want to remove if you have not done so
    already.'''
    return text3[::3]

def kill_evil_symbols(string):
    '''Replace the special unicode symbols with harmless ones. The
    replacement is \ue9c4. This is an arbitrary choice, but nobody
    seems to use it.'''
    return re.sub(u'[\u0950\u232b\u2300\u2326\u06dd]', u'\ue9c4', string)


scour_re = re.compile(ur'.{5}(?:(?:⌦.{4})+⌫.{4})*⌫.{4}(?:[⌫⌦].{4})*' 
                      ur'|.0.0.(?:[⌫⌀⌦].{4})*|(.)..(..)(?:[⌫⌦].{4})*', re.DOTALL)
def scour(weave5c):
    '''Convert a weave5c to a text3. For speed, this function makes
    some assumptions about the input. For example, all ⌀ atoms are
    assumed to be located after the final ۝, which speeds up the
    regexp and does not affect correctness of the rest of the
    algorithms. For a full list, see section 4.6 in the paper.'''
    def repl(m):
        g1 = m.group(1) or u''
        g2 = m.group(2) or u''
        return g1+g2
    text3 = scour_re.sub(repl, weave5c)
    return text3

############################################################
# Creating patch5c from insert, delete, and save-edits
############################################################

def make_insert_patch5c(string, causing_id, head_id):
    '''Create a patch5c for the insertion of a string after
    causing_id, with the first id head_id.'''
    yarn, yarn_offset = head_id[0], head_id[1]
    chunks = []
    for char in string:
        this_id = yarn + yarn_offset
        chunks.append(u'%c%s%s' % (char, causing_id, this_id))
        yarn_offset = unicode_incr(yarn_offset)
        causing_id = this_id
    return ''.join(chunks)              # patch5c

def make_delete_patch5c(text3, start_position, length, head_id):
    '''Create a patch5c for the deletion of a span in a given
    text3. The starting position (in atoms, not characters) and the
    length of the span (in atoms) define the part that will be
    deleted. The first atom of the span will have the id head_id.'''
    yarn, yarn_offset = head_id[0], head_id[1]
    start_position *= 3                # Convert to character position
    chunks = []
    for i in range(start_position, start_position+length*3, 3):
        chunks.append(u'⌫%s%c%c' % (text3[i+1:i+3], yarn, yarn_offset))
        yarn_offset = unicode_incr(yarn_offset)
    return ''.join(chunks)              # patch5c

def make_save_edits_patch5c(atom_ids, head_id):
    '''Create a save-edits patch5c which will indicate causal
    awareness of one or more atom_ids.'''
    if type(atom_ids) != list:
        raise TypeError('%r must be a list, but is not.' % atom_ids)
    yarn, yarn_offset = head_id[0], head_id[1]
    chunks = []
    for atom_id in atom_ids:
        chunks.append(u'⌀%s%c%c' % (atom_id, yarn, yarn_offset))
        yarn_offset = unicode_incr(yarn_offset)
    return ''.join(chunks)              # patch5c

############################################################
# Pulling: deriving an awareness weft from an atom.
############################################################

def make_deps4(weave5c):
    '''Convert a weave5c into deps4 form, which omits the character
    itself and only contains atoms that reference other yarns. It is
    used to simplify and speed up the pulling algorithm.'''
    sio = StringIO()
    for i in range(0, len(weave5c), 5):
        if weave5c[i+1] != weave5c[i+3]:
            sio.write(weave5c[i+1:i+5].encode('utf-8'))
    return sio.getvalue().decode('utf-8')

def pull(weave5c, atom_id, stringify=True, subweft=None, causing_id=None):
    '''Return the awareness weft of an atom with a given id, including
    the id itself. If stringify is true (the default), then the dict
    weft will be converted into a weft2. If subweft is given (a weft
    in dict format; it can be derived from a weft2 with
    make_weft_dict), then it will be assumed to be a part of the
    awareness weft. This can be used for fast incremental calculation
    of awareness wefts. This may destructively modify subweft, so pass
    a copy if this is a problem.

    For example, in a text editor, you can incrementally extend the
    awareness weft of the current atom being inserted. This lets you
    immediately calculate the awareness wefts of the heads of
    patches. The algorithm is still O(n^2), but it gets spread out
    into a bunch of minuscule increments, and the common case is fast.

    If causing_id is given, then it will be added to the awareness
    weft. This is necessary if atom_id is not in weave5c, and
    therefore its parent can not be derived from inspection of
    weave5c. It may also speed up the calculation under some
    circumstances.'''
    weft = subweft or {}
    extended = False
    
    def extend_weft(new_id):
        '''Extend the current weft to cover new_id.'''
        yarn, offset = new_id[0], new_id[1]
        if not under_weft(new_id, weft):
            weft[yarn] = offset
            extended = True

    # Common case: this atom sits right above the weft, and is caused
    # by something below the weft. In this case, just extend the weft
    # to cover the atom.
    this_yarn, this_offset = atom_id[0], atom_id[1]
    if causing_id and under_weft(causing_id, weft) \
       and ord(weft.get(this_yarn, u'0')) + 1 == ord(this_offset):
        # Extend weft slightly
        extend_weft(atom_id)
    else:
        extend_weft(atom_id)                # initialize weft
        # Add causing_id if it was given
        if causing_id: extend_weft(causing_id)
        # Build the deps4 string for easier processing
        deps4 = make_deps4(weave5c)
        # Repeatedly traverse the weave. Any causing_ids we encounter will
        # be passed to extend_weft, and if that results in the weft being
        # extended, repeat the process.
        while True:
            extended = False
            for i in range(0, len(deps4), 4):
                causing_id = deps4[i:i+2]
                this_id = deps4[i+2:i+4]
                if under_weft(this_id, weft):
                    extend_weft(causing_id)
            if not extended:
                break
    if stringify:
        return weft_to_weft2(weft)
    else:
        return weft

############################################################
# Weft manipulation (conversion, canonicalization, etc.)
############################################################

def weft2_to_weft(weft2):
    '''Convert a weft2 to a dict-based weft.'''
    weft = {}
    for i in range(0, len(weft2), 2):
        yarn, offset = weft2[i], weft2[i+1]
        if offset > weft.get(yarn, u'0'):
            weft[yarn] = offset
    return weft

def weft_to_weft2(weft):
    '''Convert a dict-based weft to a weft2. May not return it in
    sorted order.'''
    chunks = []
    for key, value in weft.iteritems():
        if key != u'0':                 # Do not include 0 yarn
            chunks.append(key + value)
    return ''.join(chunks)

def canonicalize_weft2(weft2):
    '''Return weft2 sorted by character. If there are duplicate
    chunks, their order is undefined.'''
    chunks = split_into_chunks(weft2, 2)
    chunks.sort()
    return ''.join(chunks)

def to_weftI(weft2):
    '''Convert a weft2 to a weftI. Any yarns not included in the weft2
    are filled in with zero placeholders. The weftI produced is
    assumed to have an infinite number of trailing zeros.'''
    weft = weft2_to_weft(weft2)
    # Sanitize weft by removing any keys that aren't unicode
    # characters greater than u'a'.
    keys_to_kill = []
    for key in weft.iterkeys():
        if type(key) != unicode or key < u'a':
            keys_to_kill.append(key)
    for key in keys_to_kill:
        del weft[key]
    # Build weftI, filling in any gaps
    chunks = []
    c = u'a'
    while len(weft) != 0:
        if c in weft:
            # Move this to the weftI
            chunks.append(weft[c])
            del weft[c]
        else:
            # Fill in the gap
            chunks.append(u'0')
        c = unicode_incr(c)
    return ''.join(chunks)

def gt_weftI(a, b):
    '''Is a > b, where a and b are both weftI strings? If a and b are
    of different lengths, the shorter of them will be padded with
    zeros.'''
    # Pad the shorter string with zeros
    if len(a) < len(b):
        a += u'0' * (len(b) - len(a))
    if len(b) < len(a):
        b += u'0' * (len(a) - len(b))
    return a > b
        

filtre_re = re.compile(u'(.)(.)', re.DOTALL)
def filtre(weft2):
    '''Returns a regexp string matching two-char atom ids falling
    below the given weft2. Short for filtering regexp.'''
    return filtre_re.sub(ur'\1[0-\2]|', weft2)[:-1]

def under_weft2(atom_id, weft2):
    '''Is atom_id under weft2?'''
    return re.match(filtre(weft2), atom_id, flags=re.DOTALL) is not None

def under_weft(atom_id, weft):
    '''Is atom_id under a dict-based weft?'''
    yarn, offset = atom_id[0], atom_id[1]
    current_top = weft.get(yarn, u'0')
    return offset <= current_top

def rightmost_weft2(weave5c):
    '''Return the rightmost weft2 of a given weave5c.'''
    weft = {}
    for i in range(0, len(weave5c), 5):
        atom_id = weave5c[i+3:i+5]
        if not under_weft(atom_id, weft):
            weft[atom_id[0]] = atom_id[1] # extend weft
    return weft_to_weft2(weft)

############################################################
# Yarn manipulation utilities
############################################################

def last_atom_id5c(weave5c, yarn):
    '''Return the id of the last atom in a given yarn, or None if no
    such atom is found.'''
    # Look through every atom in the weave, and pick the last in the
    # given yarn.
    last_atom = None
    for i in range(0, len(weave5c), 5):
        atom_id = weave5c[i+3:i+5]
        if atom_id[0] == yarn:
            if last_atom is None or atom_id[1] > last_atom[1]:
                last_atom = atom_id
    return last_atom

def last_atom_id3(text3, yarn):
    '''Return the id of the last atom in a given yarn, or None if no
    such atom is found. Like last_atom_id5c, but for text3. Does not
    include any of the atoms which are removed from the weave5c
    through scouring.'''
    # Look through every atom in the weave, and pick the last in the
    # given yarn.
    last_atom = None
    for i in range(0, len(text3), 3):
        atom_id = text3[i+1:i+3]
        if atom_id[0] == yarn:
            if last_atom is None or atom_id[1] > last_atom[1]:
                last_atom = atom_id
    return last_atom

############################################################
# Applying various types of patches to weaves.
############################################################

# FIXME: The weft2 optional parameter is not currently used (but it is
# tested). Make clients use it. Also modify the apply_patch5c function
# to use it.
def apply_insert_patch(weave5c, patch5c, weft2=None):
    '''Apply an insertion patch to a weave. This involves a costly
    pulling operation, which can be eliminated if the patch itself
    comes with its causal awareness weft. If this is given as the
    optional weft2 parameter, then the pulling operation will not be
    performed. This is potentially dangerous if the given weft2 is not
    complete; however, a client can always calculate the complete
    awareness weft of any of its inserted atoms.'''
    causing_atom_id = patch5c[1:3]
    my_weft = weft2 or pull(weave5c, patch5c[3:5], causing_id=causing_atom_id)
    my_weftI = None             # Compute this lazily
    # Locate the insertion point. First, we search for the causing
    # atom, then go past any delete or undeletes applied to it. That's
    # our insertion point.
    insertion_point = 0
    while True:
        insertion_point += 5  # move right one atom
        if insertion_point >= len(weave5c):
            raise BadPatchError('Causing atom not found.', patch5c, weave5c)
        prev_id = weave5c[insertion_point-2:insertion_point]
        if prev_id == causing_atom_id:
            # Skip ⌫ and ⌦.
            while True:
                right_neighbor_id = weave5c[insertion_point+3:insertion_point+5]
                if weave5c[insertion_point] in u'⌫⌦' and right_neighbor_id == causing_atom_id:
                    insertion_point += 5 # move right one atom
                else: break
            # We've found it!
            break
    while True:
        # Check right neighbor to see if we're aware of it, or if it's ۝.
        if under_weft2(right_neighbor_id, my_weft+'02'):
            # Good news! We're aware of the right neighbor, and we can
            # just insert the patch5c here.
            ##print 'Aware of right neighbor. Inserting.'
            return ''.join([weave5c[:insertion_point], patch5c, weave5c[insertion_point:]])
        else:
            # Oh no, there's a causally unaware sibling! See if the head
            # atom's awareness weftI is greater than the sibling to the
            # right. If it is, then insert here. If not, then go past the
            # right sibling and try again.
            ##print 'Unaware of right neighbor.'
            my_weftI = my_weftI or to_weftI(my_weft)
            ##print 'my_weftI:', my_weftI
            sibling_weft = pull(weave5c, right_neighbor_id)
            sibling_weftI = to_weftI(sibling_weft)
            ##print 'sibling_weftI:', sibling_weftI
            if gt_weftI(my_weftI, sibling_weftI):
                # Insert patch here, and we're done.
                ##print 'My weftI is before sibling weftI. Inserting.'
                return ''.join([weave5c[:insertion_point], patch5c, weave5c[insertion_point:]])
            else:
                # Move the insertion point past this sibling, and try
                # again. We do this by stepping to the right until the
                # atom on the right is caused by an atom whose parent is
                # not the current sibling, but an atom that the current
                # sibling is aware of. (Lemma 2)
                ##print 'Moving insertion point past sibling.'
                while True:
                    insertion_point += 5    # move right one atom
                    right_cause = weave5c[insertion_point+1:insertion_point+3]
                    if right_cause != right_neighbor_id and under_weft2(right_cause, sibling_weft+'02'):
                        break
                right_neighbor_id = weave5c[insertion_point+3:insertion_point+5]
                ##print 'New right neighbor: %s' % right_neighbor_id

def apply_delete_patch(weave5c, patch5c):
    '''Patch a weave5c with a delete patch. The patching process here
    is a little different than the process for insertion. Each
    deletion symbol is placed right after its causing atom. Does not
    require that the deletions be in any particular order.'''
    # For efficiency, we don't want to do this as an O(n^2) operation,
    # which is what would happen if we did a bunch of string
    # insertions. Instead, we write each atom to a cStringIO object,
    # inserting a delete atom after the right ones. Since cStringIO
    # can't handle anything but sequences of bytes, we encode
    # everything in UTF-8 first, and decode it afterward. Fast O(n).
    sio = StringIO()
    # Build a dict mapping atom ids to their deletion atoms.
    deletors = {}
    for deletion_atom in split_into_chunks(patch5c, 5):
        deletors[deletion_atom[1:3]] = deletion_atom
    # Go through the weave inserting deletion atoms
    for i in range(0, len(weave5c), 5):
        # Write this atom to the output
        sio.write(weave5c[i:i+5].encode('utf-8'))
        # Tack on a deletor if we have one
        this_atom_id = weave5c[i+3:i+5]
        if this_atom_id in deletors:
            sio.write(deletors[this_atom_id].encode('utf-8'))
            del deletors[this_atom_id]
    # We should have used up all the deletors.
    if len(deletors) != 0:
        raise BadPatchError('Not all deletors were used up: %s' % deletors, patch5c, weave5c)
    # Return the string, in Unicode
    return sio.getvalue().decode('utf-8')

def apply_save_edits_patch(weave5c, patch5c):
    '''Patch a weave5c with a save-edits patch. Such a patch consists
    of one or more phi atoms, which are inserted after the End atom in
    the weave5c.'''
    return weave5c + patch5c            # So easy!

############################################################
# Applying an aggregate patch to a weave
############################################################

def apply_patch5c(weave5c, patch5c):
    '''Apply a patch5c to a weave5c, and return the modified
    weave5c. This is fully general, working with insertion and
    deletion and change saving. FIXME: does not support undo. WARNING:
    if you use this function, you should probably be using the apply
    functions for each patch type instead, and represent composite
    patches as lists of insert, delete, and save-edits patches. This
    lets you pass weft2 to apply_insert_patch, which can speed it up
    quite a lot.'''
    # What we need to do is separate the patch into chunks. Each chunk
    # corresponds to an insertion span, a deletion span, or a
    # save-edits patch. Insertion spans are the hardest to
    # recognize. They are a series of non-special tokens, each caused
    # by the previous one. Deletion spans are just one or more
    # deletion symbols in a row. Save-edits spans consist of one or
    # more save-edit symbols in a row. Once we have these chunks, we
    # can use the other patching functions to apply them.
    INSERT, DELETE, SAVE = 1, 2, 3      # Span types
    def atom_type(i):
        if patch5c[i] not in u"ॐ⌫⌀⌦۝":
            return INSERT
        elif patch5c[i] == u'⌫':
            return DELETE
        elif patch5c[i] == u'⌀':
            return SAVE
        else:
            raise BadPatchError('Invalid patch5c atom: %s' % patch5c[i:i+5],
                                patch5c, weave5c)

    current_span_type = None            # options: INSERT, DELETE, SAVE
    current_span_start = 0
    current_span_end = 0
    spans = []

    for i in range(0, len(patch5c), 5):
        atype = atom_type(i)
        if atype == current_span_type:  # Continue a span
            if atype == INSERT and patch5c[i+1:i+3] == patch5c[i-2:i]:
                current_span_end = i + 5
            elif atype == DELETE or atype == SAVE:
                current_span_end = i + 5
        else:                           # This span is over
            # Save the old span
            if current_span_start != current_span_end:
                spans.append((patch5c[current_span_start:current_span_end], current_span_type))
            # Start a new span here
            current_span_start = i
            current_span_end = i + 5
            current_span_type = atype
    # Save the last span
    if current_span_start != current_span_end:
        spans.append((patch5c[current_span_start:current_span_end], current_span_type))
    # Apply each of the spans in turn
    for span, span_type in spans:
        if span_type == INSERT:
            # WARNING: this does not include any weft2 option.
            # Therefore this function, while useful, should not be
            # used in apps concerned with efficiency. Instead, groups
            # of patches should be stored as a list of patches of the
            # separate patch types, with any aux. info. attached.
            weave5c = apply_insert_patch(weave5c, span)
        elif span_type == DELETE:
            weave5c = apply_delete_patch(weave5c, span)
        elif span_type == SAVE:
            weave5c = apply_save_edits_patch(weave5c, span)
        else:
            raise Error         # This should be impossible
    return weave5c
