<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_signup_uses_compatible_payload_and_authenticates_session(): void
    {
        $response = $this->withHeader('Origin', 'http://localhost:3000')->postJson('/api/auth/sign-up/email', [
            'name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'correct horse battery staple',
        ]);
        $response->assertOk()->assertJsonPath('user.email', 'ada@example.test');
        $this->withHeader('Origin', 'http://localhost:3000')->getJson('/api/me')->assertOk()->assertJsonPath('authenticated', true);
    }

    public function test_user_can_sign_out_and_sign_back_in_without_a_remember_token_column(): void
    {
        $origin = ['Origin' => 'http://localhost:3000'];
        $credentials = [
            'email' => 'grace@example.test',
            'password' => 'correct horse battery staple',
        ];

        $this->withHeaders($origin)->postJson('/api/auth/sign-up/email', [
            ...$credentials,
            'name' => 'Grace',
        ])->assertOk();

        $this->withHeaders($origin)->postJson('/api/auth/sign-out')->assertOk();
        $this->withHeaders($origin)->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('authenticated', false);

        $this->withHeaders($origin)->postJson('/api/auth/sign-in/email', $credentials)
            ->assertOk()
            ->assertJsonPath('user.email', 'grace@example.test');
        $this->withHeaders($origin)->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('authenticated', true);
    }
}
