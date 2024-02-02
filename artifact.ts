/**
 * @param param0 
 * @param param0.lock - The lock file path for this process
 * @param param0.trigger - An asynchronous function that returns a boolean, if true, execute the process, if false, don't.
 * @param param0.acquire - An asynchronous function that acquires a resource.
 * @param param0.carves - An array of asynchronous functions that do something with the acquired resource.
 *
 * @example
 * ```ts
 * const lock = './foo.lock'
 * const trigger = async () => !await Deno.stat('foo.txt').catch(() => 0)
 * const args = ['foobar']
 * const acquire = async (...args:unknown[]) => await new Promise<string>(r => setTimeout(() => r(args[0] as string), 5000))
 * const write = async (s:string) => await Deno.writeTextFile('foo.txt', s.toUpperCase())
 * const carves = [write]
 * // the first time this is run by itself,
 * // this creates a file "foo.txt" with the text "FOOBAR" after a 5 second delay
 * // after the first time running, this will return immediately (unless "foo.txt" is deleted)
 * // if this was first called many times simultaneously,
 * // only one call would create the file after the delay,
 * // the rest would return immediately after the first call finishes  
 * await artifact({ lock, trigger, acquire, args, carves })
 * ```
 */
export async function artifact<
    A extends unknown,
    P extends unknown[]
>({
    lock, trigger, acquire, args, carves
}:{
    lock:string,
    trigger:() => Promise<boolean>,
    acquire:(...p:P) => Promise<A>,
    args:P,
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
        const a = await acquire(...args)
        const values = carves.map(carve => carve(a))
        await Promise.all(values)
    }
    await Deno.remove(lock)
}