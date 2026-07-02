// Integer lot hash — port of src/city.js uhash()/lotRand() (itself a mirror of the
// shader's uhash/lotRand). In Unity, collision and rendering both come from this same
// C# code, so GPU bit-exactness no longer matters; we keep the algorithm only to
// reproduce the same familiar city layout. `unchecked` gives the 32-bit uint wraparound.
public static class CityHash
{
    public static uint UHash(uint x)
    {
        unchecked
        {
            x = x ^ (x >> 16);
            x = x * 0x7feb352du;
            x = x ^ (x >> 15);
            x = x * 0x846ca68bu;
            x = x ^ (x >> 16);
            return x;
        }
    }

    // bi,bj block coords; li,lj lot indices 0..2; k channel 0..2. Returns [0,1).
    public static float LotRand(int bi, int bj, int li, int lj, int k)
    {
        unchecked
        {
            uint bas = (uint)((bi + 64) | ((bj + 64) << 8) | (li << 16) | (lj << 18) | (k << 20));
            return (UHash(bas) >> 16) / 65536.0f;
        }
    }
}
