# Daemon that runs in the background, applying patches to weaves on
# the Redis server. Do not instantiate more than one of this server.
import aimo2
import redis
import os, sys
import time, random
import logging
import json
import threading, signal

logging.basicConfig(filename='log-patcherd.log', level=logging.DEBUG)
logging.getLogger().addHandler(logging.StreamHandler())
r = redis.Redis()

# Sequence of events: SPOP a uuid from the pending set, txnally get
# the weave and patch-list, apply the patches to the weave, txnally
# write back the new weave and truncate the patch-list; if there are
# new patches in the patch-list, then add it to the pending
# set. Periodically (every n seconds) go through all patch-list keys
# and add them to the pending set. SPOP polling happens every second.

class PollForPatchesThread(threading.Thread):
    '''Poll for patches in the pending set, and apply patches.'''
    def run(self):
        try:
            while True:
                uuid = r.spop('pending-set')
                if uuid is None:
                    # Delay: 1 second +/- 300 ms.
                    time.sleep(random.uniform(0.7, 1.3))
                else:
                    process_uuid(uuid)
                    # Delay: 50 ms +/- 50 ms.
                    time.sleep(random.uniform(0.0, 0.1))
        except Exception as e:
            logging.error(repr(e))
            os._exit(1)

class OrphanScavengerThread(threading.Thread):
    '''Periodically add all UUIDs with non-empty patch lists to the
    pending set.'''
    def run(self):
        try:
            while True:
                uuids = [key.split(':')[0] for key in r.keys('*:patches')]
                prev_set_size = r.scard('pending-set')
                for uuid in uuids:
                    r.sadd('pending-set', uuid)
                # These numbers are approximate, as this is not a txn.
                orphans = r.scard('pending-set') - prev_set_size
                logging.info('Scavenged approximately %i orphan UUIDs' % orphans)
                # Delay for a minute, plus or minus 5 seconds
                time.sleep(random.uniform(60-5, 60+5))
        except Exception as e:
            logging.error(repr(e))
            os._exit(1)

# How long to hold off on killing blank weaves, in seconds
TIMEOUT = 60 * 60                       # one hour

class ShinigamiThread(threading.Thread):
    '''Delete empty weaves after a timeout period'''
    def run(self):
        try:
            while True:
                timeout_ago = int((time.time() - TIMEOUT)*1000.0) 
                uuids = r.zrangebyscore('empty-weaves', 0, timeout_ago)
                pipe = r.pipeline()
                for uuid in uuids:
                    pipe.delete(uuid+':patches', uuid+':weave5c',
                                uuid+':yarn-offset', uuid+':yarns')
                    pipe.zrem('empty-weaves', uuid)
                pipe.execute()
                logging.info('Garbage collected %i blank weaves' % len(uuids))
                # Delay for half a minute, plus or minus 5 seconds
                time.sleep(random.uniform(30-5, 30+5))
        except Exception as e:
            logging.error(repr(e))
            os._exit(1)

def read_uuid(uuid):
    '''Return the weave5c and patch-list for a given UUID,
    transactionally.'''
    pipe = r.pipeline()
    pipe.get(uuid + ':weave5c')
    pipe.lrange(uuid + ':patches', 0, -1)
    weave5c, patches = pipe.execute()
    return weave5c.decode('utf-8'), map(json.loads, patches)

def write_uuid(uuid, weave5c, applied_patches):
    '''Write back changes to a weave. Changes the weave5c, and removes
    the given number of patches from the patch list. If there are
    still patches pending, the uuid will be added back to the pending
    set.'''
    pipe = r.pipeline()
    pipe.set(uuid + ':weave5c', weave5c)
    pipe.ltrim(uuid + ':patches', applied_patches, -1)
    pipe.llen(uuid + ':patches')
    remaining_patches = pipe.execute()[2]
    if remaining_patches > 0:
        logging.debug('Adding %s back to pending set' % uuid)
        r.sadd('pending-set', uuid)

def process_uuid(uuid):
    '''Apply patches to a weave with a given UUID.'''
    weave5c, patches = read_uuid(uuid)
    logging.info('Applying %i patches to weave %s' % (len(patches), uuid))
    # Apply each patch to weave5c
    for patch in patches:
        try:
            if patch[0] in [u'i', u'insert']:
                weave5c = aimo2.apply_insert_patch(weave5c, patch[1], patch[2])
            elif patch[0] in [u'd', u'delete']:
                weave5c = aimo2.apply_delete_patch(weave5c, patch[1])
            elif patch[0] in [u's', u'save-edits']:
                weave5c = aimo2.apply_save_edits_patch(weave5c, patch[1])
            else:
                logging.error('Invalid patch %r' % patch) # WTF?
        except aimo2.BadPatchError as e:
            logging.error(str(e))
    # Write back changes
    write_uuid(uuid, weave5c, len(patches))

def main():
    logging.info('Starting patcher daemon.')
    poller = PollForPatchesThread()
    scavenger = OrphanScavengerThread()
    reaper = ShinigamiThread()
    poller.daemon = True
    scavenger.daemon = True
    reaper.daemon = True
    poller.start()
    scavenger.start()
    reaper.start()
    try: signal.pause()
    except KeyboardInterrupt:
        pass
    logging.info('Stopping patcher daemon.')
    

if __name__ == '__main__':
    main()
