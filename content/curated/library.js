export const LIBRARY_VOICE = Object.freeze({
    nouns: Object.freeze(['CALL NUMBER','STACK RANGE','CARD CATALOG','SHELF LIST','REFERENCE DESK','CIRCULATION DESK','BOOK TRUCK','RETURN SLOT','HOLD SHELF','RESERVE COPY','PERIODICALS','MICROFORM READER','BOUND VOLUME','INDEX VOLUME','CROSS REFERENCE','SUBJECT HEADING','AUTHOR ENTRY','TITLE ENTRY','SPINE LABEL','DUE DATE','OVERDUE NOTICE','INTERLIBRARY LOAN','ARCHIVAL ROOM','MAP CASE','FOLIO SHELF','READING LAMP','STUDY CARREL','QUIET FLOOR']),
    verbs: Object.freeze(['FOLLOW THE CALL NUMBER','CHECK THE SHELF LIST','ASK REFERENCE','RETURN TO STACKS','PLACE ON HOLD','READ THE INDEX','CROSS REFERENCE','ROLL THE BOOK TRUCK','SCAN THE SPINE','CHECK THE DUE DATE','REQUEST THE VOLUME','SEARCH BY SUBJECT','SEARCH BY AUTHOR','LOOK ONE SHELF OVER','RESHELVE IN ORDER']),
    joints: Object.freeze(['IN THE STACK RANGE','BEHIND THE REFERENCE DESK','UNDER THE READING LAMP','BETWEEN SUBJECT HEADINGS','AFTER THE RETURN SLOT','BEFORE THE HOLD SHELF','AT THE MAP CASE','PAST PERIODICALS','INSIDE THE ARCHIVAL ROOM','NEXT TO THE BOOK TRUCK'])
});
export const LIBRARY_PAIRS = Object.freeze([
    ['CALL NUMBER','coordinates for a thought'],
    ['CROSS REFERENCE','the answer may live under another name'],
    ['REFERENCE DESK','search has a human interface'],
    ['SHELF LIST','the physical collection has a database too'],
    ['RETURN SLOT','the system accepts asynchronous input'],
    ['MAP CASE','flat things need strange furniture'],
    ['INTERLIBRARY LOAN','the local world can borrow a distant object'],
    ['INDEX VOLUME','a book about where the other books speak'],
    ['SPINE LABEL','identity visible from the side'],
    ['HOLD SHELF','future possession reserved'],
    ['STUDY CARREL','focus gets three walls'],
    ['LOOK ONE SHELF OVER','classification is approximate geography']
]);
