/**
 * @param param0 
 * @param param0.lock - The lock file path for this process
 * @param param0.trigger - An asynchronous function that returns a boolean, if true, execute the process, if false, don't.
 * @param param0.acquire - An asynchronous function that acquires a resource.
 * @param param0.carves - An array of asynchronous functions that do something with the acquired resource.
 *
 * @example
 * ```ts
 * import { artifact } from './mod.ts'
 * const lock = './foo.lock'
 * const trigger = async () => !await Deno.stat('foo.txt').catch(() => 0)
 * const acquire = async () => await new Promise<string>(r => setTimeout(() => r('fOoBaR'), 5000))
 * const write = async (s:string) => await Deno.writeTextFile('foo.txt', s.toUpperCase())
 * const carves = [write]
 * // the first time this is run by itself,
 * // this creates a file "foo.txt" with the text "FOOBAR" after a 5 second delay
 * // after the first time running, this will return immediately (unless "foo.txt" is deleted)
 * // if this was first called many times simultaneously,
 * // only one call would create the file after the delay,
 * // the rest would return immediately after the first call finishes  
 * await artifact({ lock, trigger, acquire, carves })
 * ```
 */
export async function artifact<A extends unknown>({
    lock, trigger, acquire, carves
}:{
    lock:string, trigger:() => Promise<boolean>, acquire:() => Promise<A>,
    carves:((a:A) => Promise<void>)[]
}) {
    async function fn() {
        const success = !await Deno.mkdir(lock).catch(() => 1)
        if (success) return
        try { for await (const _event of Deno.watchFs(lock)) break } catch (_) {0}
        return () => fn()
    }
    let thunk = await fn()
    while (typeof thunk == 'function') thunk = await thunk()
    if (await trigger()) {
        const a = await acquire()
        const values = carves.map(carve => carve(a))
        await Promise.all(values)
    }
    await Deno.remove(lock)
}