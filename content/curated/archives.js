export const ARCHIVES_VOICE = Object.freeze({
    nouns: Object.freeze(['ACCESSION','FINDING AID','BOX LIST','FOLDER TITLE','SERIES','SUBSERIES','CALL NUMBER','SHELF MARK','RETENTION SCHEDULE','DISPOSITION','RECORD COPY','DUPLICATE COPY','SCAN BATCH','MICROFILM','MICROFICHE','REEL','INDEX CARD','DATE RANGE','PROVENANCE','CHAIN OF CUSTODY','REFERENCE REQUEST','RESTRICTED BOX','READING ROOM','STACK LOCATION','ARCHIVAL BOX','ACID-FREE FOLDER','DIGITIZATION CART','CHECKSUM']),
    verbs: Object.freeze(['FILE BY SERIES','READ THE FINDING AID','PULL THE BOX','RETURN THE FOLDER','CHECK THE DATE RANGE','VERIFY PROVENANCE','SCAN THE BATCH','REWIND THE REEL','LOG THE REQUEST','PRESERVE THE ORDER','CHECK THE RETENTION','MARK THE COPY','HASH THE IMAGE','RETURN TO STACKS','KEEP THE CONTEXT']),
    joints: Object.freeze(['IN THE STACKS','BEHIND THE FINDING AID','INSIDE THE BOX','BETWEEN SERIES','BEFORE DISPOSITION','AFTER ACCESSION','AT THE READING ROOM','PAST THE DATE RANGE','UNDER RETENTION','NEXT TO THE RECORD COPY'])
});
export const ARCHIVES_PAIRS = Object.freeze([
    ['PROVENANCE','where it came from changes what it means'],
    ['FINDING AID','the map is not the archive'],
    ['ORIGINAL ORDER','context can be physical'],
    ['RETENTION SCHEDULE','some memory has an expiration policy'],
    ['RECORD COPY','duplicates are not equally authoritative'],
    ['READING ROOM','access gets architecture'],
    ['BOX LIST','a small index into a large silence'],
    ['MICROFILM','compression by photography'],
    ['CHECKSUM','identity after copying'],
    ['ACCESSION','arrival becomes a record'],
    ['CHAIN OF CUSTODY','movement leaves a trail'],
    ['DATE RANGE','time is part of the address']
]);
