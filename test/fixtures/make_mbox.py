"""Build an mbox from .eml files with Python's stdlib mailbox module (independent of the app code).
Usage: python3 -I make_mbox.py <out.mbox> <eml>..."""
import mailbox, sys, email, email.policy
out = sys.argv[1]
box = mailbox.mbox(out, create=True)
box.lock()
try:
    for path in sys.argv[2:]:
        with open(path, 'rb') as f:
            box.add(mailbox.mboxMessage(email.message_from_binary_file(f, policy=email.policy.compat32)))
    box.flush()
finally:
    box.unlock()
print('wrote', out, len(sys.argv) - 2, 'messages')
