package io.github.zekurio.matinee.ui.components

import android.graphics.Bitmap
import android.util.LruCache
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.withSign

/**
 * A BlurHash (https://blurha.sh) decoded to a small bitmap, the blurred stand-in
 * the server sends with each image so a card shows its colors while the image
 * loads, as the web app does.
 */
object BlurHash {
    private const val CHARS =
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~"
    private val cache = LruCache<String, Bitmap>(96)

    fun decode(hash: String, width: Int = 32, height: Int = 32): Bitmap? {
        val key = "$hash:$width:$height"
        cache.get(key)?.let { return it }
        val bitmap = runCatching { render(hash, width, height) }.getOrNull() ?: return null
        cache.put(key, bitmap)
        return bitmap
    }

    private fun decode83(text: String, from: Int, to: Int): Int {
        var value = 0
        for (i in from until to) {
            val digit = CHARS.indexOf(text[i])
            require(digit >= 0) { "not a blurhash" }
            value = value * 83 + digit
        }
        return value
    }

    private fun toLinear(value: Int): Double {
        val v = value / 255.0
        return if (v <= 0.04045) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
    }

    private fun toSrgb(value: Double): Int {
        val v = value.coerceIn(0.0, 1.0)
        val srgb = if (v <= 0.0031308) v * 12.92 else 1.055 * v.pow(1 / 2.4) - 0.055
        return (srgb * 255 + 0.5).toInt().coerceIn(0, 255)
    }

    private fun signPow(value: Double, exp: Double) = Math.abs(value).pow(exp).withSign(value)

    private fun render(hash: String, width: Int, height: Int): Bitmap {
        require(hash.length >= 6)
        val size = decode83(hash, 0, 1)
        val nx = size % 9 + 1
        val ny = size / 9 + 1
        require(hash.length == 4 + 2 * nx * ny)
        val maxAc = (decode83(hash, 1, 2) + 1) / 166.0
        val colors = Array(nx * ny) { i ->
            if (i == 0) {
                val dc = decode83(hash, 2, 6)
                doubleArrayOf(toLinear(dc shr 16), toLinear((dc shr 8) and 255), toLinear(dc and 255))
            } else {
                val ac = decode83(hash, 4 + i * 2, 6 + i * 2)
                doubleArrayOf(
                    signPow((ac / (19 * 19) - 9) / 9.0, 2.0) * maxAc,
                    signPow(((ac / 19) % 19 - 9) / 9.0, 2.0) * maxAc,
                    signPow((ac % 19 - 9) / 9.0, 2.0) * maxAc,
                )
            }
        }
        val pixels = IntArray(width * height)
        val cosX = Array(width) { x -> DoubleArray(nx) { i -> cos(PI * x * i / width) } }
        val cosY = Array(height) { y -> DoubleArray(ny) { j -> cos(PI * y * j / height) } }
        for (y in 0 until height) {
            for (x in 0 until width) {
                var r = 0.0
                var g = 0.0
                var b = 0.0
                for (j in 0 until ny) {
                    for (i in 0 until nx) {
                        val basis = cosX[x][i] * cosY[y][j]
                        val color = colors[i + j * nx]
                        r += color[0] * basis
                        g += color[1] * basis
                        b += color[2] * basis
                    }
                }
                pixels[x + y * width] = (0xFF shl 24) or (toSrgb(r) shl 16) or (toSrgb(g) shl 8) or toSrgb(b)
            }
        }
        return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
    }
}
