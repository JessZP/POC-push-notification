package com.example.pocpushnotification

import android.Manifest
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import com.example.pocpushnotification.databinding.ActivityMainBinding
import com.google.firebase.messaging.FirebaseMessaging
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class MainActivity : AppCompatActivity() {

    private lateinit var requestPermissionLauncher: ActivityResultLauncher<String>
    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: SharedPreferences
    private lateinit var version: String
    private var token: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = getSharedPreferences("fcm_prefs", MODE_PRIVATE)
        version = getVersion()
        token = prefs.getString("fcm_token", null)

        binding.partnerEnvironment.text = "${BuildConfig.PARTNER}-${BuildConfig.BUILD_TYPE}"
        binding.version.text = "Versão: $version"
        binding.token.text = getTokenText()
        binding.token.setOnClickListener {
            val clipboard = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
            val clip = android.content.ClipData.newPlainText("FCM Token", token)
            clipboard.setPrimaryClip(clip)
            android.widget.Toast.makeText(this, "Token copiado para a área de transferência", android.widget.Toast.LENGTH_SHORT).show()
        }

        requestPermissionLauncher =
            registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
                if (granted) {
                    fetchFcmToken()
                } else {
                    Log.d("FCM_FIREBASE", "Notification permission denied")
                }
            }

        askNotificationPermission()
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val permission = Manifest.permission.POST_NOTIFICATIONS
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                requestPermissionLauncher.launch(permission)
            } else {
                fetchFcmToken()
            }
        } else {
            fetchFcmToken()
        }
    }

    private fun fetchFcmToken() {
        FirebaseMessaging.getInstance().token.addOnSuccessListener { fcmToken ->
            token = fcmToken
            prefs.edit { putString("fcm_token", fcmToken) }
            binding.token.text = getTokenText()
            sendToken()
            subscribeToTopics(BuildConfig.PARTNER, BuildConfig.BUILD_TYPE)
        }
    }

    private fun getTokenText(): String = token?.let { "Token: $it" } ?: "Token não gerado"

    private fun sendToken() {
        val studentId = getStudentId() ?: return
        token?.let {
            sendTokenToServer(studentId, it, version, BuildConfig.BUILD_TYPE, BuildConfig.PARTNER)
        }
    }

    private fun subscribeToTopics(partner: String, environment: String) {
        val topic = "$partner-$environment"
        FirebaseMessaging.getInstance().subscribeToTopic(topic)
            .addOnCompleteListener { task ->
                if (task.isSuccessful) Log.d("FCM_FIREBASE", "Subscribed to topic: $topic")
                else Log.e("FCM_FIREBASE", "Failed to subscribe topic: $topic")
            }
    }

    private fun getVersion(): String {
        return when {
            BuildConfig.PARTNER == "poc1" && BuildConfig.BUILD_TYPE == "qa" -> "1.0"
            BuildConfig.PARTNER == "poc1" && BuildConfig.BUILD_TYPE == "staging" -> "2.0"
            BuildConfig.PARTNER == "poc1" && BuildConfig.BUILD_TYPE == "release" -> "3.0"
            BuildConfig.PARTNER == "poc2" && BuildConfig.BUILD_TYPE == "qa" -> "4.0"
            BuildConfig.PARTNER == "poc2" && BuildConfig.BUILD_TYPE == "staging" -> "5.0"
            BuildConfig.PARTNER == "poc2" && BuildConfig.BUILD_TYPE == "release" -> "6.0"
            else -> "0.0"
        }
    }

    private fun getStudentId(): String? {
        return when {
            BuildConfig.PARTNER == "poc1" && BuildConfig.BUILD_TYPE == "qa" -> "poc1qa123456"
            BuildConfig.PARTNER == "poc1" && BuildConfig.BUILD_TYPE == "staging" -> "poc1staging123456"
            BuildConfig.PARTNER == "poc1" && BuildConfig.BUILD_TYPE == "release" -> "poc1release123456"
            BuildConfig.PARTNER == "poc2" && BuildConfig.BUILD_TYPE == "qa" -> "poc2qa123456"
            BuildConfig.PARTNER == "poc2" && BuildConfig.BUILD_TYPE == "staging" -> "poc2staging123456"
            BuildConfig.PARTNER == "poc2" && BuildConfig.BUILD_TYPE == "release" -> "poc2release123456"
            else -> null
        }
    }

    private fun sendTokenToServer(
        studentId: String,
        token: String,
        version: String,
        environment: String,
        partner: String
    ) {
        val retrofit = Retrofit.Builder()
            .baseUrl("http://10.0.2.2:3000/")
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        val service = retrofit.create(TokenApiService::class.java)
        val body = TokenRequest(
            studentId = studentId,
            token = token,
            version = version,
            environment = environment,
            partner = partner
        )

        service.sendToken(body).enqueue(object : Callback<Void> {
            override fun onResponse(call: Call<Void>, response: Response<Void>) {
                Log.d("FCM_FIREBASE", "Token sent successfully")
            }

            override fun onFailure(call: Call<Void>, t: Throwable) {
                Log.e("FCM_FIREBASE", "Failed to send token: ${t.message}")
            }
        })
    }
}

data class TokenRequest(
    val studentId: String,
    val token: String,
    val version: String,
    val environment: String,
    val partner: String
)

interface TokenApiService {
    @retrofit2.http.POST("api/token")
    fun sendToken(@retrofit2.http.Body body: TokenRequest): Call<Void>
}
