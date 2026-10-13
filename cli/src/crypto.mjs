import * as age from 'age-encryption'

export const newIdentity = () => age.generateX25519Identity()
export const recipientOf = (identity) => age.identityToRecipient(identity)

export async function encryptTo(text, recipients) {
  if (!recipients.length) throw new Error('no recipients')
  const encrypter = new age.Encrypter()
  for (const recipient of recipients) encrypter.addRecipient(recipient)
  return encrypter.encrypt(text)
}

export async function decryptWith(bytes, identity) {
  const decrypter = new age.Decrypter()
  decrypter.addIdentity(identity)
  return decrypter.decrypt(bytes, 'text')
}

export async function isRecipient(key) {
  try {
    new age.Encrypter().addRecipient(key)
    return true
  } catch {
    return false
  }
}
