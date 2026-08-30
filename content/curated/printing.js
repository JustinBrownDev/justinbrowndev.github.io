export const PRINTING_VOICE = Object.freeze({
    nouns: Object.freeze(['PLATEN','FEED ROLLER','PAPER PATH','REGISTRATION MARK','IMPRESSION CYLINDER','INK FOUNTAIN','DOCTOR BLADE','MAKE-READY','GHOST IMAGE','DUPLEXER','COLLATOR','FINISHER','STAPLE CARTRIDGE','TONER HOPPER','FUSER','TRANSFER ROLLER','DRUM UNIT','LINE PRINTER','TRACTOR FEED','FORM FEED','PERFORATION','BURST STACK','RIBBON CARTRIDGE','SPOOL FILE','PAGE COUNT','JOB TICKET','PROOF COPY','WASTE SHEET']),
    verbs: Object.freeze(['LOAD THE STOCK','CHECK REGISTRATION','MAKE READY','RUN A PROOF','CLEAR THE PATH','CHANGE THE RIBBON','ALIGN THE TRACTOR','WATCH THE FUSER','COLLATE THE SET','CHECK THE IMPRESSION','FEED ONE SHEET','BURST THE FORMS','COUNT THE PAGES','HOLD THE JOB','REPRINT THE PAGE']),
    joints: Object.freeze(['IN THE PAPER PATH','UNDER THE PLATEN','BEFORE THE FUSER','AFTER THE DRUM','AT THE TRACTOR FEED','BETWEEN IMPRESSIONS','UNDER MAKE-READY','PAST THE COLLATOR','AT THE OUTPUT TRAY','BEHIND THE JOB TICKET'])
});
export const PRINTING_PAIRS = Object.freeze([
    ['REGISTRATION','two colors must agree on where the page is'],
    ['MAKE-READY','the first good copy costs several bad ones'],
    ['TRACTOR FEED','paper with holes knows how to march'],
    ['FUSER','powder becomes permanent by heat'],
    ['SPOOL FILE','a print job can exist before paper does'],
    ['PROOF COPY','look before multiplying'],
    ['PAPER PATH','every jam has geography'],
    ['LINE PRINTER','one loud row at a time'],
    ['COLLATOR','order is part of finishing'],
    ['GHOST IMAGE','the previous page refuses to leave'],
    ['WASTE SHEET','setup has a material cost'],
    ['FORM FEED','skip to the next structured page']
]);
