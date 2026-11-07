# #356 QA-only control

Not delivery code. Check out an immutable candidate and reuse the one canonical
wheel. Product tests run as the ordinary runner uid, in an empty network
namespace with only loopback. Empty inherited environment; disposable HOME/TMP.
No real provider credentials or API. Record exact actual imported wheel bytes.

Source: every current test_skeleton_*.py. Raw JUnit, durable stores and source
provenance remain evidence; a failed test is a failure, no result relabelling.
The Mac setuid-ps limitation is not mocked in Linux. Optional binary build uses
that same wheel after source acceptance. Existing binary round trip concerns
managed resources/profile/pin/import; Chat execution is a separate explicit cell.
No formal release staging, signing, publication or protected-environment rollout.
