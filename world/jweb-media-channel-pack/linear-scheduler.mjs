function normalizePrograms(programs) {
    return programs
        .filter((program) => Number.isFinite(program.durationSec) && program.durationSec > 0)
        .map((program) => ({ ...program, durationSec: Math.max(1, Math.floor(program.durationSec)) }));
}

export function getLinearProgramAt(programs, nowMs = Date.now(), epochMs = 1704067200000) {
    const list = normalizePrograms(programs);
    if (!list.length) return null;
    const cycleSec = list.reduce((sum, program) => sum + program.durationSec, 0);
    let offsetSec = Math.floor(Math.max(0, nowMs - epochMs) / 1000) % cycleSec;
    for (let index = 0; index < list.length; index += 1) {
        const program = list[index];
        if (offsetSec < program.durationSec) {
            return Object.freeze({
                program,
                index,
                cycleSec,
                offsetSecIntoProgram: offsetSec,
                seekSec: offsetSec,
                remainingSec: program.durationSec - offsetSec,
            });
        }
        offsetSec -= program.durationSec;
    }
    return null;
}
