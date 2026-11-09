package io.github.zekurio.matinee.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import com.google.zxing.qrcode.encoder.Encoder
import io.github.zekurio.matinee.ui.theme.Palette
import kotlin.math.floor

/**
 * [text] as a QR code, black on a white card whatever the theme: phones'
 * cameras read dark on light best, and the card's padding is the quiet
 * zone they need around it.
 */
@Composable
fun QrCode(text: String, contentDescription: String, size: Dp, modifier: Modifier = Modifier) {
    val matrix = remember(text) {
        Encoder.encode(text, ErrorCorrectionLevel.M, mapOf(EncodeHintType.CHARACTER_SET to "UTF-8")).matrix
    }
    val shape = RoundedCornerShape(size / 14)
    Box(
        modifier
            .size(size)
            .clip(shape)
            .background(Color.White)
            .border(1.dp, Palette.Border, shape)
            .padding(size / 14)
            .semantics { this.contentDescription = contentDescription },
    ) {
        Canvas(Modifier.fillMaxSize().aspectRatio(1f)) {
            val modules = matrix.width
            // Whole pixels per module, so neighbours meet without seams.
            val cell = floor(this.size.minDimension / modules)
            val inset = (this.size.minDimension - cell * modules) / 2
            for (y in 0 until modules) {
                var x = 0
                while (x < modules) {
                    if (matrix.get(x, y).toInt() != 1) {
                        x++
                        continue
                    }
                    // One rectangle per run of dark modules in the row.
                    val start = x
                    while (x < modules && matrix.get(x, y).toInt() == 1) x++
                    drawRect(
                        Color.Black,
                        topLeft = Offset(inset + start * cell, inset + y * cell),
                        size = Size((x - start) * cell, cell),
                    )
                }
            }
        }
    }
}
