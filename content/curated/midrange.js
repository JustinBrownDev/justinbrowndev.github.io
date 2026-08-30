export const MIDRANGE_VOICE = Object.freeze({
    nouns: Object.freeze([
        'GREEN SCREEN', 'JOB QUEUE', 'SPOOL FILE', 'MESSAGE QUEUE', 'OUTPUT QUEUE', 'LIBRARY LIST', 'SOURCE MEMBER', 'BINDING DIRECTORY',
        'DISPLAY FILE', 'PHYSICAL FILE', 'LOGICAL FILE', 'DATA AREA', 'DATA QUEUE', 'SAVE FILE', 'BATCH JOB', 'SUBSYSTEM', 'DEVICE DESCRIPTION',
        'WORK STATION', 'COMMAND LINE', 'OBJECT LOCK', 'LEVEL CHECK', 'RECORD FORMAT', 'COMMITMENT CONTROL', 'JOB LOG', 'CALL STACK', 'PROGRAM OBJECT',
        'SERVICE PROGRAM', 'ACTIVATION GROUP', 'LIBRARY', 'MEMBER', 'SPOOL WRITER', 'PRINTER FILE', 'QUERY SESSION', 'MIDRANGE CONSOLE'
    ]),
    verbs: Object.freeze([
        'QUEUES', 'SUBMITS', 'RESTORES', 'SAVES', 'OVERRIDES', 'LOCKS', 'UNLOCKS', 'CHAINS', 'READS NEXT', 'WRITES', 'UPDATES', 'COMMITS',
        'ROLLS BACK', 'SENDS MESSAGE', 'WAITS ON REPLY', 'COMPILES', 'BINDS', 'ACTIVATES', 'SPOOLS', 'RELEASES', 'HOLDS', 'DUPLICATES',
        'CHECKS THE FORMAT', 'WATCHES THE JOB', 'FINDS THE MEMBER', 'CALLS THE OLD PROGRAM', 'STILL RUNS'
    ]),
    joints: Object.freeze(['IN', 'FROM', 'TO', 'UNDER', 'BEFORE', 'AFTER', 'THROUGH', 'BEHIND', 'WITHOUT', 'INSIDE', 'BETWEEN'])
});

export const MIDRANGE_PAIRS = Object.freeze([
    ['JOB QUEUE', 'submitted and waiting'], ['SPOOL FILE', 'printed nowhere yet'], ['LIBRARY LIST', 'order matters'], ['SOURCE MEMBER', 'older than the workstation'],
    ['LEVEL CHECK', 'format changed underneath you'], ['MESSAGE WAITING', 'reply before the night shift'], ['SAVE FILE', 'do not lose this one'], ['BIND AGAIN', 'the object remembers'],
    ['OUTPUT QUEUE', 'hold · release · repeat'], ['GREEN SCREEN', '24 rows of absolute authority'], ['COMMITMENT CONTROL', 'nothing happened until it did'],
    ['OBJECT LOCK', 'somebody else got there first'], ['JOB LOG', 'the machine already told you'], ['CALL STACK', 'follow it down'], ['PROGRAM OBJECT', 'source is not the thing running'],
    ['DISPLAY FILE', 'the screen is a file'], ['PHYSICAL FILE', 'rows with a history'], ['LOGICAL FILE', 'another way through the same rows'], ['SUBSYSTEM', 'a neighborhood for jobs'],
    ['ACTIVATION GROUP', 'a room inside the room'], ['SPOOL WRITER', 'paper is a protocol'], ['COMMAND LINE', 'prompt blinking patiently'], ['MEMBER LIST', 'one file, many little histories']
]);
