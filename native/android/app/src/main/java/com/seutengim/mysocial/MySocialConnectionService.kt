package com.seutengim.mysocial

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager

/** Self-managed Telecom registration starter. Your app must provide its own incoming-call UI. */
class MySocialConnectionService : ConnectionService() {
    override fun onCreateIncomingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle,
        request: ConnectionRequest
    ): Connection {
        val extras = request.extras ?: Bundle.EMPTY
        return MySocialConnection().apply {
            setAddress(request.address ?: Uri.parse("mysocial:unknown"), TelecomManager.PRESENTATION_ALLOWED)
            setCallerDisplayName(extras.getString(EXTRA_CALLER) ?: "MySocial 친구", TelecomManager.PRESENTATION_ALLOWED)
            setRinging()
            setConnectionCapabilities(Connection.CAPABILITY_MUTE or Connection.CAPABILITY_SUPPORT_HOLD)
            setAudioModeIsVoip(true)
        }
    }

    class MySocialConnection : Connection() {
        override fun onAnswer() {
            // TODO: call authenticated POST /api/calls/:id with accepted + SDP answer, then start native WebRTC.
            setActive()
        }
        override fun onReject() { setDisconnected(android.telecom.DisconnectCause(android.telecom.DisconnectCause.REJECTED)); destroy() }
        override fun onDisconnect() { setDisconnected(android.telecom.DisconnectCause(android.telecom.DisconnectCause.LOCAL)); destroy() }
    }

    companion object {
        const val EXTRA_CALL_ID = "callId"
        const val EXTRA_CALLER = "caller"
        private const val ACCOUNT_ID = "mysocial_calls"

        fun phoneAccount(context: Context): PhoneAccountHandle = PhoneAccountHandle(
            ComponentName(context, MySocialConnectionService::class.java), ACCOUNT_ID
        )

        fun registerPhoneAccount(context: Context) {
            val account = PhoneAccount.builder(phoneAccount(context), "MySocial")
                .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
                .build()
            context.getSystemService(TelecomManager::class.java).registerPhoneAccount(account)
        }

        fun reportIncomingCall(context: Context, callId: String, caller: String) {
            registerPhoneAccount(context)
            val extras = Bundle().apply {
                putParcelable(TelecomManager.EXTRA_INCOMING_CALL_ADDRESS, Uri.parse("mysocial:$callId"))
                putString(EXTRA_CALL_ID, callId)
                putString(EXTRA_CALLER, caller)
            }
            context.getSystemService(TelecomManager::class.java).addNewIncomingCall(phoneAccount(context), extras)
        }
    }
}
