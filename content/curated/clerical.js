export const CLERICAL_VOICE = Object.freeze({
    nouns: Object.freeze(['INBOX TRAY','OUTBOX TRAY','DATE STAMP','RECEIVED STAMP','ROUTING SLIP','COVER SHEET','CASE JACKET','FILE TAB','LABEL MAKER','CARBON COPY','DUPLICATE FORM','TRIPLICATE FORM','LEDGER','REGISTER','INDEX BOOK','MAIL CART','INTEROFFICE ENVELOPE','RETURN ADDRESS','CERTIFIED MAIL','POSTAGE METER','BATCH COVER','CONTROL TOTAL','RECONCILIATION','EXCEPTION LIST','PENDING STACK','COMPLETE STACK','INITIALS BOX','SIGNATURE LINE']),
    verbs: Object.freeze(['STAMP RECEIVED','ROUTE THE COPY','CHECK THE TOTAL','INITIAL THE BOX','FILE THE ORIGINAL','SEND THE DUPLICATE','MATCH THE BATCH','RECONCILE THE LIST','RETURN FOR CORRECTION','CLIP THE COVER','DATE THE ENTRY','LOG THE MAIL','CHECK THE SIGNATURE','MOVE TO PENDING','CLOSE THE STACK']),
    joints: Object.freeze(['IN THE INBOX','UNDER THE COVER SHEET','BEHIND THE FILE TAB','BEFORE RECONCILIATION','AFTER RECEIPT','BETWEEN COPIES','AT THE MAIL CART','PAST THE CONTROL TOTAL','INSIDE THE CASE JACKET','NEXT TO THE DATE STAMP'])
});
export const CLERICAL_PAIRS = Object.freeze([
    ['DATE STAMP','time becomes ink'],
    ['ROUTING SLIP','paper remembers where it should go'],
    ['CONTROL TOTAL','a batch should add up before it leaves'],
    ['EXCEPTION LIST','the normal process has a side door'],
    ['CERTIFIED MAIL','delivery gets a receipt'],
    ['CASE JACKET','context wrapped around documents'],
    ['TRIPLICATE','one fact, three destinations'],
    ['PENDING STACK','not done is still a state'],
    ['INITIALS BOX','accountability in two letters'],
    ['REGISTER','sequence becomes evidence'],
    ['RETURN FOR CORRECTION','workflow can move backward'],
    ['RECONCILIATION','two lists agree or explain why']
]);
