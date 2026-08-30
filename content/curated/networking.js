export const NETWORKING_VOICE = Object.freeze({
    nouns: Object.freeze(['ROUTING TABLE','ARP CACHE','MAC TABLE','VLAN','TRUNK PORT','ACCESS PORT','DEFAULT GATEWAY','STATIC ROUTE','BGP SESSION','OSPF AREA','SUBNET MASK','PREFIX LENGTH','DNS CACHE','DHCP LEASE','NAT TABLE','FIREWALL RULE','STATE TABLE','MTU','JUMBO FRAME','PACKET CAPTURE','SPAN PORT','LOOPBACK','TUNNEL','KEEPALIVE','HEARTBEAT','LATENCY','JITTER','PACKET LOSS','TTL','HOP COUNT']),
    verbs: Object.freeze(['PING AGAIN','TRACE THE ROUTE','FLUSH THE CACHE','CHECK THE ARP TABLE','FOLLOW THE VLAN','CAPTURE THE PACKET','LOWER THE MTU','VERIFY THE GATEWAY','READ THE PREFIX','WATCH THE STATE TABLE','TEST BOTH DIRECTIONS','CHECK THE RETURN PATH','DROP THE STALE LEASE','BRING THE SESSION UP','COUNT THE HOPS']),
    joints: Object.freeze(['ON THE TRUNK','BEHIND THE FIREWALL','PAST THE GATEWAY','BETWEEN SUBNETS','INSIDE THE TUNNEL','AFTER NAT','BEFORE DNS','AT HOP THREE','UNDER PACKET LOSS','ACROSS THE RETURN PATH'])
});
export const NETWORKING_PAIRS = Object.freeze([
    ['RETURN PATH','the packet has to know how to come home'],
    ['ARP CACHE','local memory of nearby machines'],
    ['MTU','sometimes the doorway is smaller than the hallway'],
    ['VLAN','same wire, different neighborhood'],
    ['PACKET CAPTURE','watch what actually crossed the wire'],
    ['DEFAULT GATEWAY','the exit most packets assume'],
    ['STATE TABLE','the firewall remembers conversations'],
    ['TTL','every hop spends a little life'],
    ['DNS CACHE','names can be stale too'],
    ['BGP SESSION','the internet is a set of arguments with timers'],
    ['STATIC ROUTE','certainty written by hand'],
    ['PACKET LOSS','absence has a percentage']
]);
